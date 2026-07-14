import { PROJECT_COMMIT_HASH } from "@/core/version"
import { generateUuid } from "@hamsterbase/foundation/uuid"
import { nanoid } from "nanoid"
import { LogEntry, LogLevel } from "./webloggerService"

const LOG_DIRECTORY = "logs"
const TAB_ID_KEY = "weblogger_tab_id"
const BATCH_SIZE = 100
const FLUSH_INTERVAL = 1000

export class WebLoggerOpfsStorage {
  private readonly instanceId = nanoid(5)
  private readonly tabId = this.getOrCreateTabId()
  private readonly pendingLogs: LogEntry[] = []
  private count = 0
  private flushTimer: number | null = null
  private writeQueue: Promise<void> = Promise.resolve()

  constructor() {
    this.saveLog(
      LogLevel.LOG,
      `WebLogger initialized with instanceId: ${this.instanceId}, tabId: ${this.tabId}, version: ${PROJECT_COMMIT_HASH}`,
    )
  }

  saveLog(level: LogLevel, message: string): void {
    const now = new Date()
    this.pendingLogs.push({
      id: generateUuid(),
      tabId: this.tabId,
      instanceId: this.instanceId,
      level,
      message,
      timestamp: now.getTime(),
      date: now.toISOString().slice(0, 10),
      count: this.count++,
    })
    if (this.pendingLogs.length >= BATCH_SIZE) void this.flushLogs()
    else if (this.flushTimer === null) this.flushTimer = window.setTimeout(() => void this.flushLogs(), FLUSH_INTERVAL)
  }

  async getAllLogs(): Promise<LogEntry[]> {
    await this.flushLogs()
    const directory = await this.directory()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const logs: LogEntry[] = []
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind !== "file" || !name.endsWith(".ndjson")) continue
      const date = new Date(name.slice(0, 10))
      if (Number.isNaN(date.getTime()) || date < cutoff) continue
      try {
        const text = await (await (handle as FileSystemFileHandle).getFile()).text()
        for (const line of text.split("\n")) {
          if (!line) continue
          logs.push(JSON.parse(line) as LogEntry)
        }
      } catch {
        // Logs are best-effort and a damaged file is intentionally discardable.
      }
    }
    return logs.sort((a, b) => a.timestamp - b.timestamp || a.count - b.count)
  }

  async cleanupOldDatabases(): Promise<void> {
    const directory = await this.directory()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind !== "file" || !name.endsWith(".ndjson")) continue
      const date = new Date(name.slice(0, 10))
      if (!Number.isNaN(date.getTime()) && date < cutoff) await directory.removeEntry(name)
    }
  }

  async dispose(): Promise<void> {
    if (this.flushTimer !== null) window.clearTimeout(this.flushTimer)
    this.flushTimer = null
    await this.flushLogs()
    await this.writeQueue
  }

  private async flushLogs(): Promise<void> {
    if (this.flushTimer !== null) window.clearTimeout(this.flushTimer)
    this.flushTimer = null
    const batch = this.pendingLogs.splice(0)
    if (batch.length === 0) return this.writeQueue
    this.writeQueue = this.writeQueue.then(async () => {
      const directory = await this.directory()
      const byDate = Map.groupBy(batch, (entry) => entry.date)
      for (const [date, entries] of byDate) {
        const name = `${date}-${this.tabId}-${this.instanceId}.ndjson`
        const handle = await directory.getFileHandle(name, { create: true })
        const currentSize = (await handle.getFile()).size
        const writer = await handle.createWritable({ keepExistingData: true })
        await writer.seek(currentSize)
        await writer.write(entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n")
        await writer.close()
      }
    })
    return this.writeQueue
  }

  private async directory(): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory()
    return root.getDirectoryHandle(LOG_DIRECTORY, { create: true })
  }

  private getOrCreateTabId(): string {
    const existing = sessionStorage.getItem(TAB_ID_KEY)
    if (existing) return existing
    const created = nanoid(5)
    sessionStorage.setItem(TAB_ID_KEY, created)
    return created
  }
}
