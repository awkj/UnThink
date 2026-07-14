package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"time"
)

const backupFormatVersion = 1

type backupFile struct {
	FormatVersion int           `json:"formatVersion"`
	CreatedAt     int64         `json:"createdAt"`
	Spaces        []backupSpace `json:"spaces"`
}

type backupSpace struct {
	Name      string         `json:"name"`
	Revision  int64          `json:"revision"`
	CreatedAt int64          `json:"createdAt"`
	UpdatedAt int64          `json:"updatedAt"`
	Snapshot  *Snapshot      `json:"snapshot,omitempty"`
	Changes   []Change       `json:"changes"`
	Clients   []backupClient `json:"clients"`
}

type backupClient struct {
	ClientID         string `json:"clientId"`
	LastSeenRevision int64  `json:"lastSeenRevision"`
	UpdatedAt        int64  `json:"updatedAt"`
}

func (s *Store) Backup(ctx context.Context, destination io.Writer) error {
	result := backupFile{FormatVersion: backupFormatVersion, CreatedAt: time.Now().UnixMilli(), Spaces: []backupSpace{}}
	rows, err := s.db.QueryContext(ctx, "SELECT id, name, revision, created_at, updated_at FROM spaces ORDER BY id")
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var space backupSpace
		if err := rows.Scan(&id, &space.Name, &space.Revision, &space.CreatedAt, &space.UpdatedAt); err != nil {
			return err
		}
		space.Changes = []Change{}
		space.Clients = []backupClient{}
		var snapshot Snapshot
		err := s.db.QueryRowContext(ctx, "SELECT revision, payload, created_at FROM snapshots WHERE space_id = $1", id).
			Scan(&snapshot.Revision, &snapshot.Payload, &snapshot.Created)
		if err == nil {
			space.Snapshot = &snapshot
		} else if err != sql.ErrNoRows {
			return err
		}
		changeRows, err := s.db.QueryContext(ctx, "SELECT revision, client_id, change_id, payload, created_at FROM changes WHERE space_id = $1 ORDER BY revision", id)
		if err != nil {
			return err
		}
		for changeRows.Next() {
			var change Change
			if err := changeRows.Scan(&change.Revision, &change.ClientID, &change.ChangeID, &change.Payload, &change.Created); err != nil {
				changeRows.Close()
				return err
			}
			space.Changes = append(space.Changes, change)
		}
		changeRows.Close()
		clientRows, err := s.db.QueryContext(ctx, "SELECT client_id, last_seen_revision, updated_at FROM clients WHERE space_id = $1", id)
		if err != nil {
			return err
		}
		for clientRows.Next() {
			var client backupClient
			if err := clientRows.Scan(&client.ClientID, &client.LastSeenRevision, &client.UpdatedAt); err != nil {
				clientRows.Close()
				return err
			}
			space.Clients = append(space.Clients, client)
		}
		clientRows.Close()
		result.Spaces = append(result.Spaces, space)
	}
	return json.NewEncoder(destination).Encode(result)
}

func (s *Store) Restore(ctx context.Context, source io.Reader) error {
	var backup backupFile
	if err := json.NewDecoder(source).Decode(&backup); err != nil {
		return fmt.Errorf("decode backup: %w", err)
	}
	if backup.FormatVersion != backupFormatVersion {
		return fmt.Errorf("unsupported backup format version %d", backup.FormatVersion)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "TRUNCATE TABLE spaces RESTART IDENTITY CASCADE"); err != nil {
		return err
	}
	for _, space := range backup.Spaces {
		var id int64
		if err := tx.QueryRowContext(ctx, `INSERT INTO spaces(user_id, name, revision, created_at, updated_at)
VALUES($1, $2, $3, $4, $5) RETURNING id`, defaultUserID, space.Name, space.Revision, space.CreatedAt, space.UpdatedAt).Scan(&id); err != nil {
			return err
		}
		if space.Snapshot != nil {
			if _, err := tx.ExecContext(ctx, "INSERT INTO snapshots(space_id, revision, payload, created_at) VALUES($1,$2,$3,$4)", id, space.Snapshot.Revision, space.Snapshot.Payload, space.Snapshot.Created); err != nil {
				return err
			}
		}
		for _, change := range space.Changes {
			if _, err := tx.ExecContext(ctx, "INSERT INTO changes(space_id, revision, client_id, change_id, payload, created_at) VALUES($1,$2,$3,$4,$5,$6)", id, change.Revision, change.ClientID, change.ChangeID, change.Payload, change.Created); err != nil {
				return err
			}
		}
		for _, client := range space.Clients {
			if _, err := tx.ExecContext(ctx, "INSERT INTO clients(space_id, client_id, last_seen_revision, updated_at) VALUES($1,$2,$3,$4)", id, client.ClientID, client.LastSeenRevision, client.UpdatedAt); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func (s *Store) Rebuild(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, "DROP TABLE IF EXISTS clients, snapshots, changes, spaces, users, schema_migrations CASCADE"); err != nil {
		return err
	}
	return s.migrate(ctx, s.authToken)
}
