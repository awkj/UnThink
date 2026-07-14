# Tasks sync server

Single-user synchronization server for HamsterBase Tasks. It is written in Go,
stores opaque CRDT changes in PostgreSQL, and uses one bearer token for
authentication.

## Run locally

```bash
AUTH_TOKEN='replace-with-a-long-random-token' \
DATABASE_URL='postgres://tasks:password@127.0.0.1:5432/tasks?sslmode=disable' \
ADDRESS=':8400' \
go run ./cmd/tasks-server
```

Configuration:

| Variable | Default | Description |
| --- | --- | --- |
| `AUTH_TOKEN` | required | Single-user bearer token |
| `DATABASE_URL` | required | PostgreSQL connection URL |
| `ADDRESS` | `:8400` | HTTP listen address |
| `STATIC_DIR` | empty | Vite build directory to serve |
| `CORS_ORIGIN` | `*` | Allowed web origin |

## Docker Compose

The canonical `Dockerfile` and `compose.yaml` live in the repository root. The
image contains both the Vite web app and this Go API, while Compose starts that
image together with PostgreSQL and RustFS. PostgreSQL stores task sync changes,
while RustFS stores attachment objects through its S3-compatible API.

Create `.env` in the repository root:

```bash
pnpm env:generate
```

This generates all required credentials locally using cryptographically secure
random values. It refuses to overwrite an existing `.env`; use
`pnpm env:generate --force` only when you intentionally want to rotate every
credential. To inspect a fresh file without writing it, use
`pnpm env:generate --stdout`.

Alternatively, create the file manually:

```dotenv
AUTH_TOKEN=replace-with-a-long-random-token
POSTGRES_PASSWORD=replace-with-a-database-password
RUSTFS_ACCESS_KEY=replace-with-a-rustfs-access-key
RUSTFS_SECRET_KEY=replace-with-a-long-random-secret-key
RUSTFS_SERVER_ACCESS_KEY=replace-with-a-server-access-key
RUSTFS_SERVER_SECRET_KEY=replace-with-a-different-long-random-secret-key
```

From the repository root, start the web app, API, PostgreSQL, and RustFS:

```bash
docker compose up --build
```

For local development, start PostgreSQL and RustFS with Docker and run the Go
API directly on the host:

```bash
# repository root: start PostgreSQL, RustFS, and initialize the attachment bucket
docker compose up -d postgres rustfs rustfs-init

# repository root: run the API on the host
AUTH_TOKEN=dev-token \
DATABASE_URL='postgres://tasks:dev-password@127.0.0.1:8432/tasks?sslmode=disable' \
CORS_ORIGIN='http://localhost:4000' \
ATTACHMENTS_ENDPOINT='http://127.0.0.1:8401' \
ATTACHMENTS_BUCKET='tasks-attachments' \
ATTACHMENTS_REGION='us-east-1' \
ATTACHMENTS_ACCESS_KEY='replace-with-the-RUSTFS_SERVER_ACCESS_KEY' \
ATTACHMENTS_SECRET_KEY='replace-with-the-RUSTFS_SERVER_SECRET_KEY' \
go run ./cmd/tasks-server
```

PostgreSQL is exposed on `127.0.0.1:8432` by default for local debugging:

```bash
psql 'postgres://tasks:replace-with-a-database-password@127.0.0.1:8432/tasks'
```

To connect from another machine, explicitly set `POSTGRES_BIND=0.0.0.0` and
`RUSTFS_BIND=0.0.0.0` on the Docker host, and protect ports `8432`, `8401`, and
`8402` with a firewall or private network. Do not expose these services directly
to the public internet. The host-side ports can be overridden with
`POSTGRES_PORT`, `RUSTFS_API_PORT`, and `RUSTFS_CONSOLE_PORT`.

Useful tables:

- `spaces`: sync folders and current revisions
- `changes`: immutable Loro changes
- `snapshots`: compacted Loro snapshots
- `clients`: device sync cursors

## Attachment storage

The Compose stack starts RustFS on its internal ports `9000`/`9001` and creates
the `tasks-attachments` bucket automatically. On the host, the S3 API listens on
`127.0.0.1:8401` and the management console on `127.0.0.1:8402` by default.

When a Tasks client connects to the self-hosted sync server, it automatically
detects attachment support through the authenticated
`GET /api/v1/attachments/config` endpoint. Existing clients migrate on their
next startup. A manually configured third-party S3 service is not overwritten.

Clients upload and download through the Tasks API using the existing bearer
token. The Go server streams objects to and from RustFS over the private Docker
network. The initialization container creates a RustFS user restricted to the
attachment bucket; neither that credential nor the administrator credential is
ever sent to clients.

For production, expose only the Tasks API over HTTPS and restrict `CORS_ORIGIN`
to the deployed Web origin. RustFS does not require a public endpoint or browser
CORS configuration.

## API

完整的客户端请求流程、通知去重、快照策略和接口请求/响应示例见
[自托管同步流程与服务端 API](../docs/self-hosted-sync.md)。

All space endpoints require:

```http
Authorization: Bearer <AUTH_TOKEN>
```

- `GET /api/v1/health`
- `GET /api/v1/attachments/config`
- `PUT /api/v1/attachments/objects/{key...}`
- `GET /api/v1/attachments/objects/{key...}`
- `GET /api/v1/spaces/{space}/status`
- `GET /api/v1/spaces/{space}/changes?after=0&clientId=<id>`
- `GET /api/v1/spaces/{space}/events?clientId=<id>`
- `GET /api/v1/spaces/{space}/snapshot`
- `POST /api/v1/spaces/{space}/changes`
- `PUT /api/v1/spaces/{space}/snapshot`
- `DELETE /api/v1/spaces/{space}/clients/{clientId}`

Snapshots use `application/cbor`; incremental change requests and responses use
`application/cbor-seq`. Payload fields are CBOR byte strings and are stored as
PostgreSQL `BYTEA`, without Base64 expansion. JSON responses negotiate HTTP zstd
compression through `Accept-Encoding`. The server deliberately does not
interpret CRDT contents. The events endpoint is an authenticated SSE
stream that emits committed revision numbers and excludes revisions uploaded by
the subscribing client. It sends a heartbeat every 25 seconds; reverse proxies
must allow streaming responses and disable response buffering for this route.
Instances exchange revision signals through PostgreSQL `LISTEN/NOTIFY`; the
dedicated listener reconnects with bounded exponential backoff and SSE does not
poll the revision table.
Space names are trimmed and normalized to lowercase, making them
case-insensitive across every sync endpoint.

## Database administration

The same environment variables used by the server are used by these commands:

```bash
go run ./cmd/tasks-server backup ./tasks-backup.json
go run ./cmd/tasks-server restore ./tasks-backup.json
go run ./cmd/tasks-server rebuild
```

Restore and rebuild are destructive. Backups are versioned JSON containing
spaces, snapshots, remaining changes and client acknowledgement watermarks.
Published SQL migrations have SHA-256 checksums; startup fails if an applied
migration no longer matches its embedded contents.
