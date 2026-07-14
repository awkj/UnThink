import { IDatabaseMeta, IDatabaseService, IDatabaseStorage, LocalDatabaseMeta } from "./database"
import { ManifestStorage, StorageFileAdapter } from "./manifestStorage"

const ROOT_DIRECTORY = "unthink-v2"

async function readTextFile(directory: FileSystemDirectoryHandle, name: string): Promise<string> {
  return (await (await directory.getFileHandle(name)).getFile()).text()
}

class OpfsStorage implements IDatabaseStorage {
  private readonly storage: ManifestStorage

  constructor(
    directory: FileSystemDirectoryHandle,
    private readonly meta: IDatabaseMeta,
  ) {
    const adapter: StorageFileAdapter = {
      readText: async (name) => {
        try {
          return await (await (await directory.getFileHandle(name)).getFile()).text()
        } catch (error) {
          if (error instanceof DOMException && error.name === "NotFoundError") return null
          throw error
        }
      },
      readBinary: async (name) => {
        const file = await (await directory.getFileHandle(name)).getFile()
        return new Uint8Array(await file.arrayBuffer())
      },
      writeBinary: async (name, content) => {
        const file = await directory.getFileHandle(name, { create: true })
        const writer = await file.createWritable()
        await writer.write(Uint8Array.from(content).buffer)
        await writer.close()
      },
      atomicWriteText: async (name, content) => {
        const file = await directory.getFileHandle(name, { create: true })
        const writer = await file.createWritable()
        await writer.write(content)
        await writer.close()
      },
      remove: async (name) => directory.removeEntry(name),
    }
    this.storage = new ManifestStorage(adapter)
  }

  get id(): string {
    return this.meta.id
  }

  load(): Promise<Uint8Array[]> {
    return this.storage.load()
  }

  append(content: Uint8Array): Promise<void> {
    return this.storage.append(content)
  }

  compact(snapshot: Uint8Array): Promise<void> {
    return this.storage.compact(snapshot)
  }

  entryCount(): Promise<number> {
    return this.storage.entryCount()
  }
}

export class OpfsDatabaseService implements IDatabaseService {
  readonly _serviceBrand: undefined

  private async root(): Promise<FileSystemDirectoryHandle> {
    const opfs = await navigator.storage.getDirectory()
    return opfs.getDirectoryHandle(ROOT_DIRECTORY, { create: true })
  }

  private async directory(databaseId: string, create = false): Promise<FileSystemDirectoryHandle> {
    return (await this.root()).getDirectoryHandle(`db-${databaseId}`, { create })
  }

  async ensureDatabase(meta: IDatabaseMeta): Promise<void> {
    const directory = await this.directory(meta.id, true)
    const metadataFile = await directory.getFileHandle("_meta.json", { create: true })
    if ((await metadataFile.getFile()).size === 0) {
      const writer = await metadataFile.createWritable()
      await writer.write(JSON.stringify(meta))
      await writer.close()
    }
  }

  async listDatabases(): Promise<IDatabaseMeta[]> {
    await this.ensureDatabase(LocalDatabaseMeta)
    const databases: IDatabaseMeta[] = []
    for await (const [, handle] of (await this.root()).entries()) {
      if (handle.kind !== "directory") continue
      try {
        databases.push(JSON.parse(await readTextFile(handle, "_meta.json")) as IDatabaseMeta)
      } catch (error) {
        console.warn("Ignoring invalid OPFS database metadata:", error)
      }
    }
    return databases
  }

  async getDatabaseMeta(databaseId: string): Promise<IDatabaseMeta> {
    const meta = (await this.listDatabases()).find((database) => database.id === databaseId)
    if (!meta) throw new Error("Database not found")
    return meta
  }

  async getDatabaseStorage(databaseId: string): Promise<IDatabaseStorage> {
    const meta = databaseId === "local" ? LocalDatabaseMeta : await this.getDatabaseMeta(databaseId)
    await this.ensureDatabase(meta)
    return new OpfsStorage(await this.directory(databaseId), meta)
  }

  async deleteDatabase(databaseId: string): Promise<void> {
    await (await this.root()).removeEntry(`db-${databaseId}`, { recursive: true })
  }
}
