export const STORAGE_FORMAT_VERSION = 1

export interface StorageFileAdapter {
  readText(name: string): Promise<string | null>
  readBinary(name: string): Promise<Uint8Array>
  writeBinary(name: string, content: Uint8Array): Promise<void>
  atomicWriteText(name: string, content: string): Promise<void>
  remove(name: string): Promise<void>
}

interface FileRef {
  file: string
  size: number
  checksum: string
}

interface WalRef extends FileRef {
  sequence: number
}

export interface StorageManifest {
  formatVersion: typeof STORAGE_FORMAT_VERSION
  generation: number
  nextSequence: number
  snapshot: (FileRef & { sequence: number }) | null
  wal: WalRef[]
}

const MANIFEST = "manifest.json"
const PREVIOUS_MANIFEST = "manifest.previous.json"

function emptyManifest(): StorageManifest {
  return { formatVersion: STORAGE_FORMAT_VERSION, generation: 0, nextSequence: 1, snapshot: null, wal: [] }
}

function checksum(data: Uint8Array): string {
  let hash = 0x811c9dc5
  for (const byte of data) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function isFileRef(value: unknown): value is FileRef {
  if (!value || typeof value !== "object") return false
  const ref = value as Partial<FileRef>
  return typeof ref.file === "string" && typeof ref.size === "number" && typeof ref.checksum === "string"
}

function parseManifest(raw: string | null): StorageManifest | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<StorageManifest>
    if (
      value.formatVersion !== STORAGE_FORMAT_VERSION ||
      typeof value.generation !== "number" ||
      typeof value.nextSequence !== "number" ||
      (value.snapshot !== null && !isFileRef(value.snapshot)) ||
      !Array.isArray(value.wal) ||
      !value.wal.every((entry) => isFileRef(entry) && typeof entry.sequence === "number")
    ) {
      return null
    }
    return value as StorageManifest
  } catch {
    return null
  }
}

async function readVerified(adapter: StorageFileAdapter, ref: FileRef): Promise<Uint8Array> {
  const data = await adapter.readBinary(ref.file)
  if (data.byteLength !== ref.size || checksum(data) !== ref.checksum) {
    throw new Error(`Corrupt storage file: ${ref.file}`)
  }
  return data
}

export class ManifestStorage {
  private current: StorageManifest | null = null

  constructor(private readonly adapter: StorageFileAdapter) {}

  async load(): Promise<Uint8Array[]> {
    const candidates = await this.readCandidates()
    if (candidates.length === 0) {
      this.current = emptyManifest()
      await this.commit(this.current)
      return []
    }
    let lastError: unknown
    for (const candidate of candidates) {
      try {
        const blobs: Uint8Array[] = []
        if (candidate.snapshot) blobs.push(await readVerified(this.adapter, candidate.snapshot))
        const orderedWal = [...candidate.wal].sort((a, b) => a.sequence - b.sequence)
        for (const entry of orderedWal) blobs.push(await readVerified(this.adapter, entry))
        this.current = candidate
        return blobs
      } catch (error) {
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new Error("No valid storage generation")
  }

  async append(content: Uint8Array): Promise<void> {
    const manifest = await this.ensureLoaded()
    const sequence = manifest.nextSequence
    const file = `wal-${sequence.toString().padStart(12, "0")}.loro`
    await this.adapter.writeBinary(file, content)
    const next: StorageManifest = {
      ...manifest,
      generation: manifest.generation + 1,
      nextSequence: sequence + 1,
      wal: [...manifest.wal, { file, sequence, size: content.byteLength, checksum: checksum(content) }],
    }
    await this.commit(next)
    this.current = next
  }

  async compact(snapshot: Uint8Array): Promise<void> {
    const manifest = await this.ensureLoaded()
    const sequence = manifest.nextSequence - 1
    const file = `snapshot-${manifest.generation.toString().padStart(12, "0")}.loro`
    await this.adapter.writeBinary(file, snapshot)
    const next: StorageManifest = {
      formatVersion: STORAGE_FORMAT_VERSION,
      generation: manifest.generation + 1,
      nextSequence: manifest.nextSequence,
      snapshot: { file, sequence, size: snapshot.byteLength, checksum: checksum(snapshot) },
      wal: [],
    }
    const staleManifest = await this.commit(next)
    this.current = next

    const retained = new Set([file, manifest.snapshot?.file, ...manifest.wal.map((entry) => entry.file)])
    const obsolete = staleManifest
      ? [staleManifest.snapshot?.file, ...staleManifest.wal.map((entry) => entry.file)].filter((name): name is string =>
          Boolean(name && !retained.has(name)),
        )
      : []
    await Promise.all(obsolete.map((name) => this.adapter.remove(name).catch(() => undefined)))
  }

  async entryCount(): Promise<number> {
    const manifest = await this.ensureLoaded()
    return (manifest.snapshot ? 1 : 0) + manifest.wal.length
  }

  private async ensureLoaded(): Promise<StorageManifest> {
    if (!this.current) await this.load()
    return this.current ?? emptyManifest()
  }

  private async readCandidates(): Promise<StorageManifest[]> {
    const manifests = await Promise.all([
      this.adapter.readText(MANIFEST).then(parseManifest),
      this.adapter.readText(PREVIOUS_MANIFEST).then(parseManifest),
    ])
    return manifests
      .filter((value): value is StorageManifest => value !== null)
      .sort((a, b) => b.generation - a.generation)
  }

  private async commit(next: StorageManifest): Promise<StorageManifest | null> {
    const currentRaw = await this.adapter.readText(MANIFEST)
    const previousRaw = await this.adapter.readText(PREVIOUS_MANIFEST)
    if (parseManifest(currentRaw)) await this.adapter.atomicWriteText(PREVIOUS_MANIFEST, currentRaw as string)
    await this.adapter.atomicWriteText(MANIFEST, JSON.stringify(next))
    return parseManifest(previousRaw)
  }
}
