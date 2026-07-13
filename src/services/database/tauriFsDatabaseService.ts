import { BaseDirectory } from "@tauri-apps/api/path"
import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs"
import { IDatabaseMeta, IDatabaseService, IDatabaseStorage, LocalDatabaseMeta } from "./database"
import { TauriFileStorage } from "./tauriFileStorage"

export class TauriFsDatabaseService implements IDatabaseService {
  readonly _serviceBrand: undefined
  private readonly basePath = "unthink-v2"

  async listDatabases(): Promise<IDatabaseMeta[]> {
    await this.ensureRoot()
    await this.ensureDatabase(LocalDatabaseMeta)
    const entries = await readDir(this.basePath, { baseDir: BaseDirectory.AppData })
    const databases: IDatabaseMeta[] = []
    for (const entry of entries.filter((item) => item.isDirectory)) {
      try {
        const content = await readTextFile(`${this.basePath}/${entry.name}/_meta.json`, {
          baseDir: BaseDirectory.AppData,
        })
        databases.push(JSON.parse(content) as IDatabaseMeta)
      } catch (error) {
        console.error(`Failed to read database metadata for ${entry.name}`, error)
      }
    }
    return databases
  }

  async ensureDatabase(meta: IDatabaseMeta): Promise<void> {
    await this.ensureRoot()
    const path = this.databasePath(meta.id)
    if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(path, { baseDir: BaseDirectory.AppData, recursive: true })
    }
    await writeTextFile(`${path}/_meta.json`, JSON.stringify(meta), {
      baseDir: BaseDirectory.AppData,
    })
  }

  async deleteDatabase(databaseId: string): Promise<void> {
    await remove(this.databasePath(databaseId), {
      baseDir: BaseDirectory.AppData,
      recursive: true,
    })
  }

  async getDatabaseStorage(databaseId: string): Promise<IDatabaseStorage> {
    const meta = databaseId === "local" ? LocalDatabaseMeta : await this.getDatabaseMeta(databaseId)
    return new TauriFileStorage(this.databasePath(databaseId), meta)
  }

  async getDatabaseMeta(databaseId: string): Promise<IDatabaseMeta> {
    const databases = await this.listDatabases()
    const meta = databases.find((database) => database.id === databaseId)
    if (!meta) throw new Error("Database not found")
    return meta
  }

  private databasePath(databaseId: string): string {
    return `${this.basePath}/db-${databaseId}`
  }

  private async ensureRoot(): Promise<void> {
    if (!(await exists(this.basePath, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(this.basePath, { baseDir: BaseDirectory.AppData, recursive: true })
    }
  }
}
