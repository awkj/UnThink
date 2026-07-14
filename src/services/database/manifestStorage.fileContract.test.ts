import assert from "node:assert/strict"
import { mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { ManifestStorage, type StorageFileAdapter } from "./manifestStorage"

async function fileAdapter(directory: string): Promise<StorageFileAdapter> {
  const resolve = (name: string) => path.join(directory, name)
  return {
    readText: async (name) => {
      try {
        return await readFile(resolve(name), "utf8")
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
        throw error
      }
    },
    readBinary: async (name) => new Uint8Array(await readFile(resolve(name))),
    writeBinary: async (name, content) => writeFile(resolve(name), content),
    atomicWriteText: async (name, content) => {
      const temporary = resolve(`${name}.tmp`)
      await writeFile(temporary, content, "utf8")
      await rename(temporary, resolve(name))
    },
    remove: async (name) => {
      await unlink(resolve(name)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error
      })
    },
  }
}

test("Tauri-compatible atomic file adapter satisfies the manifest storage contract", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "unthink-storage-contract-"))
  try {
    const storage = new ManifestStorage(await fileAdapter(directory))
    await storage.compact(Uint8Array.of(1, 2))
    await storage.append(Uint8Array.of(3))
    await storage.append(Uint8Array.of(4, 5))
    assert.deepEqual(
      (await storage.load()).map((value) => Array.from(value)),
      [[1, 2], [3], [4, 5]],
    )
    assert.equal(await storage.entryCount(), 3)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
