import * as fs from "fs/promises"
import * as path from "path"
import { IDatabaseMeta } from "@/services/database/database"
import { getDataDirs, resolveDatabaseDir } from "./paths"

const DIR_PREFIX = "db-"
const FILE_EXT = ".loro"

export async function listDatabases(): Promise<IDatabaseMeta[]> {
  const byId = new Map<string, IDatabaseMeta>()

  for (const base of getDataDirs()) {
    const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(DIR_PREFIX)) continue
      try {
        const raw = await fs.readFile(path.join(base, entry.name, "_meta.json"), "utf8")
        const meta: IDatabaseMeta = JSON.parse(raw)
        if (!byId.has(meta.id)) byId.set(meta.id, meta)
      } catch {
        // skip unreadable entries
      }
    }
  }

  // No synthesized `local` fallback: `db ls` reflects what is actually on
  // disk. The desktop app writes `db-local/_meta.json` on
  // first use, so real users still see `local`; a CLI-only/fresh setup
  // correctly shows nothing rather than a phantom database.
  return Array.from(byId.values())
}

export function resolveDatabase(
  input: string,
  dbs: IDatabaseMeta[],
): IDatabaseMeta | { error: string; candidates?: IDatabaseMeta[] } {
  const exact = dbs.find((d) => d.id === input)
  if (exact) return exact

  const prefixMatches = dbs.filter((d) => d.id.startsWith(input))
  const singlePrefixMatch = prefixMatches.length === 1 ? prefixMatches[0] : undefined
  if (singlePrefixMatch) return singlePrefixMatch
  if (prefixMatches.length > 1) {
    return { error: `"${input}" matches ${prefixMatches.length} databases`, candidates: prefixMatches }
  }
  return { error: `no database matches "${input}"` }
}

export async function countTaskFiles(databaseId: string): Promise<number> {
  try {
    const files = await fs.readdir(await resolveDatabaseDir(databaseId))
    return files.filter((f) => f.endsWith(FILE_EXT) && f !== "_meta.json").length
  } catch {
    return 0
  }
}

export async function readSnapshotBlobs(databaseId: string): Promise<Uint8Array[]> {
  const dir = await resolveDatabaseDir(databaseId)
  let files: string[]
  try {
    files = await fs.readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return []
    throw err
  }
  const taskFiles = files.filter((f) => f.endsWith(FILE_EXT) && f !== "_meta.json")

  const blobs: Uint8Array[] = []
  for (const name of taskFiles) {
    try {
      blobs.push(new Uint8Array(await fs.readFile(path.join(dir, name))))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue
      throw err
    }
  }
  return blobs
}
