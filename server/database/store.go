package database

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const defaultUserID = "default"
const clientLeaseDuration = 90 * 24 * time.Hour
const cleanupBatchSize = 1000

//go:embed migrations/*.sql
var migrationFiles embed.FS

type Store struct {
	db              *sql.DB
	databaseURL     string
	authToken       string
	notifications   chan RevisionNotification
	cleanupRequests chan int64
	listenerCancel  context.CancelFunc
	listenerPID     atomic.Uint32
}

type RevisionNotification struct {
	Space    string `json:"space"`
	ClientID string `json:"clientId"`
	Revision int64  `json:"revision"`
}

type Status struct {
	Revision         int64
	SnapshotRevision int64
}

type Change struct {
	Revision int64
	ClientID string
	ChangeID string
	Payload  []byte
	Created  int64
}

type Snapshot struct {
	Revision int64
	Payload  []byte
	Created  int64
}

type ChangePage struct {
	Revision         int64
	SnapshotRevision int64
	NextRevision     int64
	PayloadBytes     int64
	Changes          []Change
	HasMore          bool
}

type executor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func Open(ctx context.Context, databaseURL, authToken string) (*Store, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxIdleTime(5 * time.Minute)
	db.SetConnMaxLifetime(30 * time.Minute)
	listenerCtx, listenerCancel := context.WithCancel(context.Background())
	store := &Store{
		db: db, databaseURL: databaseURL, authToken: authToken,
		notifications:   make(chan RevisionNotification, 64),
		cleanupRequests: make(chan int64, 64), listenerCancel: listenerCancel,
	}
	if err := store.migrate(ctx, authToken); err != nil {
		listenerCancel()
		db.Close()
		return nil, err
	}
	listenerReady := make(chan struct{})
	go store.listenForRevisions(listenerCtx, listenerReady)
	select {
	case <-listenerReady:
	case <-time.After(5 * time.Second):
		listenerCancel()
		db.Close()
		return nil, errors.New("postgres revision listener did not become ready")
	}
	go store.runCleanup(listenerCtx)
	return store, nil
}

func (s *Store) migrate(ctx context.Context, authToken string) error {
	if err := s.db.PingContext(ctx); err != nil {
		return fmt.Errorf("connect to postgres: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		applied_at BIGINT NOT NULL,
		checksum TEXT
	)`); err != nil {
		return fmt.Errorf("initialize migrations table: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, "ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT"); err != nil {
		return fmt.Errorf("upgrade migrations table: %w", err)
	}
	entries, err := fs.ReadDir(migrationFiles, "migrations")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
			continue
		}
		prefix := strings.SplitN(entry.Name(), "_", 2)[0]
		version, err := strconv.Atoi(prefix)
		if err != nil {
			return fmt.Errorf("invalid migration filename %q: %w", entry.Name(), err)
		}
		contents, err := migrationFiles.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("read migration %d: %w", version, err)
		}
		digest := sha256.Sum256(contents)
		checksum := fmt.Sprintf("%x", digest)
		var storedChecksum sql.NullString
		err = s.db.QueryRowContext(ctx,
			"SELECT checksum FROM schema_migrations WHERE version = $1", version,
		).Scan(&storedChecksum)
		if err == nil {
			if storedChecksum.Valid && storedChecksum.String != checksum {
				return fmt.Errorf("migration %d checksum mismatch: applied %s, embedded %s", version, storedChecksum.String, checksum)
			}
			if !storedChecksum.Valid {
				if _, err := s.db.ExecContext(ctx, "UPDATE schema_migrations SET checksum = $1 WHERE version = $2", checksum, version); err != nil {
					return fmt.Errorf("backfill migration %d checksum: %w", version, err)
				}
			}
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("check migration %d: %w", version, err)
		}
		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin migration %d: %w", version, err)
		}
		if _, err = tx.ExecContext(ctx, string(contents)); err == nil {
			_, err = tx.ExecContext(ctx,
				"INSERT INTO schema_migrations(version, applied_at, checksum) VALUES($1, $2, $3)",
				version, time.Now().UnixMilli(), checksum,
			)
		}
		if err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("apply migration %d: %w", version, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %d: %w", version, err)
		}
	}
	hash := sha256.Sum256([]byte(authToken))
	_, err = s.db.ExecContext(ctx, `
INSERT INTO users(id, token_hash, created_at) VALUES($1, $2, $3)
ON CONFLICT(id) DO UPDATE SET token_hash = excluded.token_hash`,
		defaultUserID, hash[:], time.Now().UnixMilli())
	if err != nil {
		return fmt.Errorf("initialize user: %w", err)
	}
	return nil
}

func (s *Store) Close() error {
	s.listenerCancel()
	return s.db.Close()
}

func (s *Store) RevisionNotifications() <-chan RevisionNotification { return s.notifications }

func (s *Store) listenForRevisions(ctx context.Context, ready chan<- struct{}) {
	defer close(s.notifications)
	backoff := 100 * time.Millisecond
	readySent := false
	for ctx.Err() == nil {
		conn, err := pgx.Connect(ctx, s.databaseURL)
		if err == nil {
			_, err = conn.Exec(ctx, "LISTEN unthink_revisions")
		}
		if err != nil {
			if conn != nil {
				_ = conn.Close(context.Background())
			}
			timer := time.NewTimer(backoff)
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
			}
			backoff = min(backoff*2, 5*time.Second)
			continue
		}
		backoff = 100 * time.Millisecond
		s.listenerPID.Store(conn.PgConn().PID())
		if !readySent {
			close(ready)
			readySent = true
		}
		for ctx.Err() == nil {
			notification, waitErr := conn.WaitForNotification(ctx)
			if waitErr != nil {
				break
			}
			var event RevisionNotification
			if json.Unmarshal([]byte(notification.Payload), &event) != nil || event.Space == "" || event.Revision < 1 {
				continue
			}
			select {
			case s.notifications <- event:
			default:
				select {
				case <-s.notifications:
				default:
				}
				s.notifications <- event
			}
		}
		_ = conn.Close(context.Background())
		s.listenerPID.Store(0)
	}
}

func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }

func (s *Store) ensureSpace(ctx context.Context, e executor, name string) (int64, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return 0, errors.New("space name must not be empty")
	}
	now := time.Now().UnixMilli()
	var id int64
	err := e.QueryRowContext(ctx, `
INSERT INTO spaces(user_id, name, created_at, updated_at) VALUES($1, $2, $3, $3)
ON CONFLICT(user_id, name) DO UPDATE SET name = excluded.name
RETURNING id`, defaultUserID, name, now).Scan(&id)
	return id, err
}

func (s *Store) Status(ctx context.Context, space string) (Status, error) {
	spaceID, err := s.ensureSpace(ctx, s.db, space)
	if err != nil {
		return Status{}, err
	}
	var status Status
	err = s.db.QueryRowContext(ctx, `
SELECT s.revision, COALESCE(sn.revision, 0)
FROM spaces s LEFT JOIN snapshots sn ON sn.space_id = s.id
WHERE s.id = $1`, spaceID).Scan(&status.Revision, &status.SnapshotRevision)
	return status, err
}

func (s *Store) AppendChange(ctx context.Context, space, clientID, changeID string, payload []byte) (int64, bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback()
	spaceID, err := s.ensureSpace(ctx, tx, space)
	if err != nil {
		return 0, false, err
	}
	var existing int64
	err = tx.QueryRowContext(ctx, `
SELECT revision FROM changes WHERE space_id = $1 AND client_id = $2 AND change_id = $3`,
		spaceID, clientID, changeID).Scan(&existing)
	if err == nil {
		return existing, true, tx.Commit()
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, false, err
	}
	var revision int64
	err = tx.QueryRowContext(ctx, `
UPDATE spaces SET revision = revision + 1, updated_at = $1 WHERE id = $2 RETURNING revision`,
		time.Now().UnixMilli(), spaceID).Scan(&revision)
	if err != nil {
		return 0, false, err
	}
	_, err = tx.ExecContext(ctx, `
INSERT INTO changes(space_id, revision, client_id, change_id, payload, created_at)
VALUES($1, $2, $3, $4, $5, $6)`,
		spaceID, revision, clientID, changeID, payload, time.Now().UnixMilli())
	if err != nil {
		return 0, false, err
	}
	notification, err := json.Marshal(RevisionNotification{Space: strings.ToLower(strings.TrimSpace(space)), ClientID: clientID, Revision: revision})
	if err != nil {
		return 0, false, err
	}
	if _, err = tx.ExecContext(ctx, "SELECT pg_notify('unthink_revisions', $1)", string(notification)); err != nil {
		return 0, false, err
	}
	if err := tx.Commit(); err != nil {
		return 0, false, err
	}
	return revision, false, nil
}

func (s *Store) ListChanges(
	ctx context.Context,
	space, clientID string,
	after int64,
	limit int,
	maxPayloadBytes int64,
) (ChangePage, error) {
	spaceID, err := s.ensureSpace(ctx, s.db, space)
	if err != nil {
		return ChangePage{}, err
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return ChangePage{}, err
	}
	defer tx.Rollback()
	page := ChangePage{Changes: []Change{}, NextRevision: after}
	if err := tx.QueryRowContext(ctx, `
SELECT s.revision, COALESCE(sn.revision, 0)
FROM spaces s LEFT JOIN snapshots sn ON sn.space_id = s.id
WHERE s.id = $1`, spaceID).Scan(&page.Revision, &page.SnapshotRevision); err != nil {
		return ChangePage{}, err
	}
	if after < page.SnapshotRevision {
		if err := tx.Commit(); err != nil {
			return ChangePage{}, err
		}
		if err := s.acknowledgeClient(ctx, spaceID, clientID, after); err != nil {
			return ChangePage{}, err
		}
		return page, nil
	}
	rows, err := tx.QueryContext(ctx, `
SELECT revision, client_id, change_id, payload, created_at
FROM changes
WHERE space_id = $1 AND revision > $2 AND revision <= $3
ORDER BY revision ASC LIMIT $4`,
		spaceID, after, page.Revision, limit+1)
	if err != nil {
		return ChangePage{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var change Change
		if err := rows.Scan(&change.Revision, &change.ClientID, &change.ChangeID, &change.Payload, &change.Created); err != nil {
			return ChangePage{}, err
		}
		if len(page.Changes) == limit ||
			(page.PayloadBytes > 0 && page.PayloadBytes+int64(len(change.Payload)) > maxPayloadBytes) {
			page.HasMore = true
			break
		}
		page.Changes = append(page.Changes, change)
		page.NextRevision = change.Revision
		page.PayloadBytes += int64(len(change.Payload))
	}
	if err := rows.Err(); err != nil {
		return ChangePage{}, err
	}
	if err := rows.Close(); err != nil {
		return ChangePage{}, err
	}
	if err := tx.Commit(); err != nil {
		return ChangePage{}, err
	}
	if page.NextRevision < page.Revision {
		page.HasMore = true
	}
	if err := s.acknowledgeClient(ctx, spaceID, clientID, page.NextRevision); err != nil {
		return ChangePage{}, err
	}
	s.requestCleanup(spaceID)
	return page, nil
}

func (s *Store) acknowledgeClient(ctx context.Context, spaceID int64, clientID string, revision int64) error {
	if clientID == "" {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `
INSERT INTO clients(space_id, client_id, last_seen_revision, updated_at) VALUES($1, $2, $3, $4)
ON CONFLICT(space_id, client_id) DO UPDATE SET
  last_seen_revision = GREATEST(clients.last_seen_revision, excluded.last_seen_revision),
  updated_at = excluded.updated_at`,
		spaceID, clientID, revision, time.Now().UnixMilli())
	return err
}

func (s *Store) cleanupWaterline(ctx context.Context, spaceID int64) (int64, error) {
	var waterline sql.NullInt64
	if err := s.db.QueryRowContext(ctx, `
SELECT LEAST(sn.revision, COALESCE(MIN(c.last_seen_revision), sn.revision))
FROM snapshots sn LEFT JOIN clients c ON c.space_id = sn.space_id
WHERE sn.space_id = $1 GROUP BY sn.revision`, spaceID).Scan(&waterline); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, nil
		}
		return 0, err
	}
	if !waterline.Valid || waterline.Int64 < 1 {
		return 0, nil
	}
	return waterline.Int64, nil
}

func (s *Store) GetSnapshot(ctx context.Context, space string) (Snapshot, error) {
	spaceID, err := s.ensureSpace(ctx, s.db, space)
	if err != nil {
		return Snapshot{}, err
	}
	var snapshot Snapshot
	err = s.db.QueryRowContext(ctx,
		"SELECT revision, payload, created_at FROM snapshots WHERE space_id = $1", spaceID,
	).Scan(&snapshot.Revision, &snapshot.Payload, &snapshot.Created)
	return snapshot, err
}

func (s *Store) PutSnapshot(ctx context.Context, space string, coversRevision int64, payload []byte) (Status, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Status{}, err
	}
	defer tx.Rollback()
	spaceID, err := s.ensureSpace(ctx, tx, space)
	if err != nil {
		return Status{}, err
	}
	var current, previous int64
	if err := tx.QueryRowContext(ctx, "SELECT revision FROM spaces WHERE id = $1 FOR UPDATE", spaceID).
		Scan(&current); err != nil {
		return Status{}, err
	}
	if coversRevision > current {
		return Status{}, fmt.Errorf("snapshot revision %d exceeds server revision %d", coversRevision, current)
	}
	_ = tx.QueryRowContext(ctx, "SELECT revision FROM snapshots WHERE space_id = $1", spaceID).Scan(&previous)
	if coversRevision > previous {
		_, err = tx.ExecContext(ctx, `
INSERT INTO snapshots(space_id, revision, payload, created_at) VALUES($1, $2, $3, $4)
ON CONFLICT(space_id) DO UPDATE SET
  revision = excluded.revision, payload = excluded.payload, created_at = excluded.created_at`,
			spaceID, coversRevision, payload, time.Now().UnixMilli())
		if err != nil {
			return Status{}, err
		}
		previous = coversRevision
	}
	if err := tx.Commit(); err != nil {
		return Status{}, err
	}
	s.requestCleanup(spaceID)
	return Status{Revision: current, SnapshotRevision: previous}, nil
}

func (s *Store) DeleteClient(ctx context.Context, space, clientID string) error {
	spaceID, err := s.ensureSpace(ctx, s.db, space)
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx,
		"DELETE FROM clients WHERE space_id = $1 AND client_id = $2", spaceID, clientID,
	); err != nil {
		return err
	}
	s.requestCleanup(spaceID)
	return nil
}

func (s *Store) requestCleanup(spaceID int64) {
	select {
	case s.cleanupRequests <- spaceID:
	default:
	}
}

func (s *Store) runCleanup(ctx context.Context) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	s.pruneExpiredClients(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case spaceID := <-s.cleanupRequests:
			s.cleanupSpace(ctx, spaceID)
		case <-ticker.C:
			s.pruneExpiredClients(ctx)
		}
	}
}

func (s *Store) pruneExpiredClients(ctx context.Context) {
	cutoff := time.Now().Add(-clientLeaseDuration).UnixMilli()
	if _, err := s.db.ExecContext(ctx, "DELETE FROM clients WHERE updated_at < $1", cutoff); err != nil {
		return
	}
	rows, err := s.db.QueryContext(ctx, "SELECT id FROM spaces")
	if err != nil {
		return
	}
	var spaceIDs []int64
	for rows.Next() {
		var spaceID int64
		if rows.Scan(&spaceID) == nil {
			spaceIDs = append(spaceIDs, spaceID)
		}
	}
	rows.Close()
	for _, spaceID := range spaceIDs {
		if ctx.Err() != nil {
			return
		}
		s.cleanupSpace(ctx, spaceID)
	}
}

func (s *Store) cleanupSpace(ctx context.Context, spaceID int64) {
	waterline, err := s.cleanupWaterline(ctx, spaceID)
	if err != nil || waterline == 0 {
		return
	}
	for ctx.Err() == nil {
		result, err := s.db.ExecContext(ctx, `
DELETE FROM changes WHERE id IN (
  SELECT id FROM changes
  WHERE space_id = $1 AND revision <= $2
  ORDER BY revision ASC LIMIT $3
)`, spaceID, waterline, cleanupBatchSize)
		if err != nil {
			return
		}
		deleted, err := result.RowsAffected()
		if err != nil || deleted < cleanupBatchSize {
			return
		}
	}
}
