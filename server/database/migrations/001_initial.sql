CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  token_hash BYTEA NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS spaces (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS changes (
  id BIGSERIAL PRIMARY KEY,
  space_id BIGINT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL,
  client_id TEXT NOT NULL,
  change_id TEXT NOT NULL,
  payload BYTEA NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE(space_id, revision),
  UNIQUE(space_id, client_id, change_id)
);

CREATE INDEX IF NOT EXISTS changes_space_revision_idx ON changes(space_id, revision);

CREATE TABLE IF NOT EXISTS snapshots (
  space_id BIGINT PRIMARY KEY REFERENCES spaces(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL,
  payload BYTEA NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  space_id BIGINT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  last_seen_revision BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY(space_id, client_id)
);
