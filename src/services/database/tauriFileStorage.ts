import { BaseDirectory } from "@tauri-apps/api/path"
import { exists, mkdir, readFile, readTextFile, remove, rename, writeFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { IDatabaseMeta, IDatabaseStorage } from "./database"
import { ManifestStorage, StorageFileAdapter } from "./manifestStorage"

export class TauriFileStorage implements IDatabaseStorage {
  private readonly storage: ManifestStorage

  constructor(
    private readonly baseDir: string,
    private readonly meta: IDatabaseMeta,
  ) {
    const path = (name: string) => `${baseDir}/${name}`
    const options = { baseDir: BaseDirectory.AppData } as const
    const adapter: StorageFileAdapter = {
      readText: async (name) => ((await exists(path(name), options)) ? readTextFile(path(name), options) : null),
      readBinary: (name) => readFile(path(name), options),
      writeBinary: async (name, content) => {
        await this.ensureBaseDir()
        await writeFile(path(name), content, options)
      },
      atomicWriteText: async (name, content) => {
        await this.ensureBaseDir()
        const temporary = path(`${name}.tmp`)
        await writeTextFile(temporary, content, options)
        await rename(temporary, path(name), {
          oldPathBaseDir: BaseDirectory.AppData,
          newPathBaseDir: BaseDirectory.AppData,
        })
      },
      remove: (name) => remove(path(name), options),
    }
    this.storage = new ManifestStorage(adapter)
  }

  get id(): string {
    return this.meta.id
  }

  async load(): Promise<Uint8Array[]> {
    await this.ensureBaseDir()
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

  private async ensureBaseDir(): Promise<void> {
    if (!(await exists(this.baseDir, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(this.baseDir, { baseDir: BaseDirectory.AppData, recursive: true })
    }
    const metaPath = `${this.baseDir}/_meta.json`
    if (!(await exists(metaPath, { baseDir: BaseDirectory.AppData }))) {
      await writeTextFile(metaPath, JSON.stringify(this.meta), { baseDir: BaseDirectory.AppData })
    }
  }
}
