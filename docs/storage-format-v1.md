# Unthink binary storage format v1

Each database lives in `unthink-v2/db-<database-id>/` and contains:

- `_meta.json`: user-facing database metadata.
- `manifest.json`: the newest committed storage generation.
- `manifest.previous.json`: the previous committed generation used for recovery.
- `snapshot-<generation>.loro`: a complete Loro snapshot.
- `wal-<sequence>.loro`: one incremental Loro update per monotonically increasing sequence.

The manifest records `formatVersion`, `generation`, `nextSequence`, one optional
snapshot reference and an ordered WAL reference list. Every binary reference
contains its byte length and FNV-1a checksum. Unknown format versions are
rejected instead of being interpreted as v1.

## Commit protocol

Append writes the new WAL file completely before publishing a manifest that
references it. A crash before the manifest commit leaves only an ignored orphan.

Compact writes a new uniquely named snapshot before publishing a manifest that
references it and clears the active WAL. The old manifest is atomically retained
as `manifest.previous.json`; files referenced by it are retained for recovery.
Files older than both retained generations may be removed after a later compact.

Tauri and CLI publish manifests through a same-directory temporary file plus
atomic rename. OPFS `createWritable()` commits the replacement on successful
close and preserves the prior file if the stream is aborted. On load, both
manifest generations are tried newest-first, binary size/checksum is verified,
and WAL entries are replayed by sequence rather than directory enumeration.

There is intentionally no reader or migration for the pre-v1 random `.loro`
layout. The project permits destructive storage changes for this release.

## Non-task browser storage

Web logs use per-tab daily NDJSON files under `unthink-v2/logs/`. Separate files
avoid cross-tab append contention; malformed log files are skipped and files
older than seven days are removed. IndexedDB log databases are not migrated.

Ordinary configuration remains one small `localStorage` JSON object. Moving it
to OPFS would add asynchronous file coordination to every settings write without
improving confidentiality (OPFS is not a credential vault), while Tauri WebView
support is less uniform than localStorage. Keychain/Keystore is explicitly out
of scope, so localStorage is the deliberate result of the evaluation.
