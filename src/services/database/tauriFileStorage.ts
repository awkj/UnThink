import { BaseDirectory } from "@tauri-apps/api/path"
import { exists, mkdir, readDir, readFile, remove, writeFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { generateUuid } from "@hamsterbase/foundation/uuid"
import { IDatabaseMeta, IDatabaseStorage } from "./database"

const fileExtension = ".loro"

export class TauriFileStorage implements IDatabaseStorage {
  constructor(
    private readonly baseDir: string,
    private readonly meta: IDatabaseMeta,
  ) {}

  get id(): string {
    return this.meta.id
  }

  async save(content: Uint8Array): Promise<string> {
    await this.ensureBaseDir()
    const key = generateUuid()
    await writeFile(`${this.baseDir}/${key}${fileExtension}`, content, {
      baseDir: BaseDirectory.AppData,
    })
    return key
  }

  async delete(key: string): Promise<void> {
    await remove(`${this.baseDir}/${key}${fileExtension}`, {
      baseDir: BaseDirectory.AppData,
    })
  }

  async list(): Promise<string[]> {
    await this.ensureBaseDir()
    const entries = await readDir(this.baseDir, { baseDir: BaseDirectory.AppData })
    return entries
      .filter((entry) => entry.isFile && entry.name.endsWith(fileExtension))
      .map((entry) => entry.name.slice(0, -fileExtension.length))
  }

  async read(key: string): Promise<Uint8Array> {
    return readFile(`${this.baseDir}/${key}${fileExtension}`, {
      baseDir: BaseDirectory.AppData,
    })
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
