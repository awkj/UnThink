package database

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestConcurrentChangesReceiveUniqueRevisions(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	store, err := Open(context.Background(), databaseURL, "test-token")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	const count = 20
	revisions := make(chan int64, count)
	errors := make(chan error, count)
	var wait sync.WaitGroup
	for index := range count {
		wait.Add(1)
		go func() {
			defer wait.Done()
			revision, duplicate, err := store.AppendChange(
				context.Background(),
				"concurrent-test",
				fmt.Sprintf("client-%d", index),
				fmt.Sprintf("change-%d", index),
				[]byte(fmt.Sprintf("payload-%d", index)),
			)
			if err != nil {
				errors <- err
				return
			}
			if duplicate {
				errors <- fmt.Errorf("change %d was unexpectedly marked duplicate", index)
				return
			}
			revisions <- revision
		}()
	}
	wait.Wait()
	close(errors)
	close(revisions)
	for err := range errors {
		t.Error(err)
	}
	seen := make(map[int64]bool, count)
	for revision := range revisions {
		seen[revision] = true
	}
	if len(seen) != count {
		t.Fatalf("got %d unique revisions, want %d", len(seen), count)
	}
	for revision := int64(1); revision <= count; revision++ {
		if !seen[revision] {
			t.Errorf("revision %d is missing", revision)
		}
	}
}

func TestRevisionNotificationsCrossInstancesAndReconnect(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	listener, err := Open(context.Background(), databaseURL, "test-token")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	writer, err := Open(context.Background(), databaseURL, "test-token")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = writer.Close() })
	space := fmt.Sprintf("notify-%d", time.Now().UnixNano())

	assertNotification := func(changeID string) {
		t.Helper()
		revision, _, err := writer.AppendChange(context.Background(), space, "remote-client", changeID, []byte(changeID))
		if err != nil {
			t.Fatal(err)
		}
		select {
		case event := <-listener.RevisionNotifications():
			if event.Space != space || event.Revision != revision || event.ClientID != "remote-client" {
				t.Fatalf("unexpected notification: %#v", event)
			}
		case <-time.After(3 * time.Second):
			t.Fatal("timed out waiting for cross-instance notification")
		}
	}

	assertNotification("before-reconnect")
	pid := listener.listenerPID.Load()
	if pid == 0 {
		t.Fatal("listener backend pid is unavailable")
	}
	if _, err := listener.db.ExecContext(context.Background(), "SELECT pg_terminate_backend($1)", pid); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) && (listener.listenerPID.Load() == 0 || listener.listenerPID.Load() == pid) {
		time.Sleep(25 * time.Millisecond)
	}
	if listener.listenerPID.Load() == 0 || listener.listenerPID.Load() == pid {
		t.Fatal("revision listener did not reconnect")
	}
	assertNotification("after-reconnect")
}

func TestExpiredClientLeaseReleasesChangeCleanupWaterline(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	store, err := Open(context.Background(), databaseURL, "test-token")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	ctx := context.Background()
	space := fmt.Sprintf("lease-cleanup-%d", time.Now().UnixNano())
	for index := 1; index <= 2; index++ {
		if _, _, err := store.AppendChange(
			ctx, space, "writer", fmt.Sprintf("change-%d", index), []byte("payload"),
		); err != nil {
			t.Fatal(err)
		}
	}
	spaceID, err := store.ensureSpace(ctx, store.db, space)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.acknowledgeClient(ctx, spaceID, "active-client", 2); err != nil {
		t.Fatal(err)
	}
	if err := store.acknowledgeClient(ctx, spaceID, "expired-client", 0); err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutSnapshot(ctx, space, 2, []byte("snapshot")); err != nil {
		t.Fatal(err)
	}
	store.cleanupSpace(ctx, spaceID)
	assertChangeCount(t, store, spaceID, 2)

	if _, err := store.db.ExecContext(ctx,
		"UPDATE clients SET updated_at = $1 WHERE space_id = $2 AND client_id = $3",
		time.Now().Add(-clientLeaseDuration-time.Hour).UnixMilli(), spaceID, "expired-client",
	); err != nil {
		t.Fatal(err)
	}
	store.pruneExpiredClients(ctx)
	assertChangeCount(t, store, spaceID, 0)

	var expiredClients int
	if err := store.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM clients WHERE space_id = $1 AND client_id = $2", spaceID, "expired-client",
	).Scan(&expiredClients); err != nil {
		t.Fatal(err)
	}
	if expiredClients != 0 {
		t.Fatalf("expired client count = %d, want 0", expiredClients)
	}
}

func assertChangeCount(t *testing.T, store *Store, spaceID int64, want int) {
	t.Helper()
	var count int
	if err := store.db.QueryRowContext(context.Background(),
		"SELECT COUNT(*) FROM changes WHERE space_id = $1", spaceID,
	).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != want {
		t.Fatalf("change count = %d, want %d", count, want)
	}
}

func TestPublishedMigrationChecksumCannotChange(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	store, err := Open(context.Background(), databaseURL, "test-token")
	if err != nil {
		t.Fatal(err)
	}
	contents, err := migrationFiles.ReadFile("migrations/001_initial.sql")
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(contents)
	expected := fmt.Sprintf("%x", digest)
	if _, err := store.db.ExecContext(context.Background(), "UPDATE schema_migrations SET checksum = 'tampered' WHERE version = 1"); err != nil {
		t.Fatal(err)
	}
	_ = store.Close()
	t.Cleanup(func() {
		repair, openErr := sql.Open("pgx", databaseURL)
		if openErr == nil {
			_, _ = repair.ExecContext(context.Background(), "UPDATE schema_migrations SET checksum = $1 WHERE version = 1", expected)
			_ = repair.Close()
		}
	})

	_, err = Open(context.Background(), databaseURL, "test-token")
	if err == nil || !strings.Contains(err.Error(), "checksum mismatch") {
		t.Fatalf("expected checksum mismatch, got %v", err)
	}
}
