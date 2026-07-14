type WorkerResponse = { type: "snapshot"; requestId: number; snapshot: ArrayBuffer }

function transferableCopies(updates: Uint8Array[]): ArrayBuffer[] {
  return updates.map((update) => Uint8Array.from(update).buffer)
}

export class LoroPersistenceWorkerClient {
  private worker: Worker | null = null
  private nextRequestId = 1
  private readonly pending = new Map<
    number,
    { resolve: (snapshot: Uint8Array) => void; timeout: ReturnType<typeof setTimeout> }
  >()

  constructor(
    initialUpdates: Uint8Array[],
    private readonly fallbackSnapshot: () => Uint8Array,
  ) {
    if (typeof Worker === "undefined") return
    try {
      this.worker = new Worker(new URL("./loroPersistence.worker.ts", import.meta.url), { type: "module" })
      this.worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
        const pending = this.pending.get(event.data.requestId)
        if (!pending) return
        this.pending.delete(event.data.requestId)
        clearTimeout(pending.timeout)
        pending.resolve(new Uint8Array(event.data.snapshot))
      })
      this.worker.addEventListener("error", () => this.disableWorker())
      const updates = transferableCopies(initialUpdates)
      this.worker.postMessage({ type: "init", updates }, updates)
    } catch {
      this.worker = null
    }
  }

  import(updates: Uint8Array[]): void {
    if (!this.worker || updates.length === 0) return
    const copies = transferableCopies(updates)
    this.worker.postMessage({ type: "import", updates: copies }, copies)
  }

  snapshot(): Promise<Uint8Array> {
    if (!this.worker) return Promise.resolve(this.fallbackSnapshot())
    const requestId = this.nextRequestId++
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        const pending = this.pending.get(requestId)
        if (!pending) return
        this.pending.delete(requestId)
        pending.resolve(this.fallbackSnapshot())
        this.disableWorker()
      }, 5_000)
      this.pending.set(requestId, { resolve, timeout })
      this.worker?.postMessage({ type: "snapshot", requestId })
    })
  }

  dispose(): void {
    this.disableWorker()
  }

  private disableWorker(): void {
    this.worker?.terminate()
    this.worker = null
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.resolve(this.fallbackSnapshot())
    }
    this.pending.clear()
  }
}
