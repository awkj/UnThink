import { IDatabaseMeta, IDatabaseService, IDatabaseStorage, LocalDatabaseMeta } from "./database"

const ROOT_DIRECTORY = "unthink-v2"
const FILE_EXTENSION = ".loro"

async function readTextFile(directory: FileSystemDirectoryHandle, name: string): Promise<string> {
  return (await (await directory.getFileHandle(name)).getFile()).text()
}

class OpfsStorage implements IDatabaseStorage {
  constructor(
    private readonly directory: FileSystemDirectoryHandle,
    private readonly meta: IDatabaseMeta,
  ) {}

  get id(): string {
    return this.meta.id
  }

  async save(content: Uint8Array): Promise<string> {
    const key = crypto.randomUUID()
    const file = await this.directory.getFileHandle(`${key}${FILE_EXTENSION}`, { create: true })
    const writer = await file.createWritable()
    await writer.write(Uint8Array.from(content).buffer)
    await writer.close()
    return key
  }

  async delete(key: string): Promise<void> {
    await this.directory.removeEntry(`${key}${FILE_EXTENSION}`)
  }

  async list(): Promise<string[]> {
    const keys: string[] = []
    for await (const [name, handle] of this.directory.entries()) {
      if (handle.kind === "file" && name.endsWith(FILE_EXTENSION)) {
        keys.push(name.slice(0, -FILE_EXTENSION.length))
      }
    }
    return keys
  }

  async read(key: string): Promise<Uint8Array> {
    const file = await (await this.directory.getFileHandle(`${key}${FILE_EXTENSION}`)).getFile()
    return new Uint8Array(await file.arrayBuffer())
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
