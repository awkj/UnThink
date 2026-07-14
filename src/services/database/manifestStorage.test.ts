import assert from "node:assert/strict"
import { test } from "node:test"
import { ManifestStorage, StorageFileAdapter } from "./manifestStorage"

class MemoryAdapter implements StorageFileAdapter {
  readonly files = new Map<string, Uint8Array>()
  failNextAtomicWrite: string | null = null

  async readText(name: string): Promise<string | null> {
    const data = this.files.get(name)
    return data ? new TextDecoder().decode(data) : null
  }

  async readBinary(name: string): Promise<Uint8Array> {
    const data = this.files.get(name)
    if (!data) throw new Error(`ENOENT: ${name}`)
    return Uint8Array.from(data)
  }

  async writeBinary(name: string, content: Uint8Array): Promise<void> {
    this.files.set(name, Uint8Array.from(content))
  }

  async atomicWriteText(name: string, content: string): Promise<void> {
    if (this.failNextAtomicWrite === name) {
      this.failNextAtomicWrite = null
      throw new Error(`injected write failure: ${name}`)
    }
    this.files.set(name, new TextEncoder().encode(content))
  }

  async remove(name: string): Promise<void> {
    this.files.delete(name)
  }
}

const bytes = (...values: number[]) => Uint8Array.from(values)
const arrays = (values: Uint8Array[]) => values.map((value) => Array.from(value))

test("manifest contract replays WAL in sequence order", async () => {
  const adapter = new MemoryAdapter()
  const storage = new ManifestStorage(adapter)
  await storage.load()
  await storage.append(bytes(1))
  await storage.append(bytes(2))

  assert.deepEqual(arrays(await new ManifestStorage(adapter).load()), [[1], [2]])
  assert.equal(await storage.entryCount(), 2)
})

test("interrupted append leaves the last committed generation readable", async () => {
  const adapter = new MemoryAdapter()
  const storage = new ManifestStorage(adapter)
  await storage.load()
  await storage.append(bytes(1))
  adapter.failNextAtomicWrite = "manifest.json"

  await assert.rejects(storage.append(bytes(2)), /injected write failure/)
  assert.deepEqual(arrays(await new ManifestStorage(adapter).load()), [[1]])
})

test("interrupted compact retains the previous snapshot and WAL", async () => {
  const adapter = new MemoryAdapter()
  const storage = new ManifestStorage(adapter)
  await storage.load()
  await storage.append(bytes(1))
  adapter.failNextAtomicWrite = "manifest.json"

  await assert.rejects(storage.compact(bytes(9)), /injected write failure/)
  assert.deepEqual(arrays(await new ManifestStorage(adapter).load()), [[1]])
})

test("corrupt newest snapshot falls back to the previous manifest generation", async () => {
  const adapter = new MemoryAdapter()
  const storage = new ManifestStorage(adapter)
  await storage.load()
  await storage.append(bytes(1))
  await storage.compact(bytes(9))
  const manifest = JSON.parse((await adapter.readText("manifest.json")) ?? "{}") as {
    snapshot?: { file?: string }
  }
  assert.ok(manifest.snapshot?.file)
  adapter.files.set(manifest.snapshot.file, bytes(0))

  assert.deepEqual(arrays(await new ManifestStorage(adapter).load()), [[1]])
})

test("serialized concurrent appends keep every update", async () => {
  const adapter = new MemoryAdapter()
  const storage = new ManifestStorage(adapter)
  await storage.load()
  let pending = Promise.resolve()
  const append = (value: number) => {
    const result = pending.then(() => storage.append(bytes(value)))
    pending = result.catch(() => undefined)
    return result
  }
  await Promise.all([append(1), append(2), append(3)])

  assert.deepEqual(arrays(await new ManifestStorage(adapter).load()), [[1], [2], [3]])
})
