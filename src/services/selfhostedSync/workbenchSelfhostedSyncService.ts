import {
  selfhostedSyncEnabledConfigKey,
  selfhostedSyncMetadataConfigKey,
  thirdpartySyncServersConfigKey,
} from "@/services/config/config"
import { IConfigService } from "@/services/config/configService"
import { ITodoService } from "@/services/todo/todoService"
import { IAttachmentUploadService } from "@/services/attachment/attachmentUploadService"
import { Emitter } from "@hamsterbase/foundation/event"
import { generateUuid } from "@hamsterbase/foundation/uuid"
import { LoroDoc } from "loro-crdt"
import { HttpError } from "@/services/serverApi/error"
import { SelfhostedServerStorage } from "./SelfhostedServerStorage"
import {
  ISelfhostedSyncMetadata,
  ISelfhostedSyncServerConfig,
  ISelfhostedSyncService,
} from "./selfhostedSyncService.ts"

const LOCAL_CHANGE_DEBOUNCE_MS = 500
const REMOTE_POLL_INTERVAL_MS = 60_000
const SNAPSHOT_INTERVAL = 100
const MAX_RETRY_DELAY_MS = 60_000
const MAX_EVENT_RECONNECT_DELAY_MS = 30_000

function mergeVersions(left: Record<string, number>, right: Record<string, number>): Record<string, number> {
  const merged = { ...left }
  for (const [peer, version] of Object.entries(right)) {
    merged[peer] = Math.max(merged[peer] ?? 0, version)
  }
  return merged
}

function hasVersionBeyond(current: Record<string, number>, known: Record<string, number>): boolean {
  return Object.entries(current).some(([peer, version]) => version > (known[peer] ?? 0))
}

function isTransientEventStreamDisconnect(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && error.name === "TypeError")
}

function getPayloadVersion(payloads: Uint8Array[]): Record<string, number> {
  if (payloads.length === 0) return {}
  const doc = new LoroDoc()
  for (const payload of payloads) {
    doc.import(payload)
  }
  const version: Record<string, number> = {}
  doc
    .version()
    .toJSON()
    .forEach((value, peer) => {
      version[peer] = value
    })
  return version
}

export class WorkbenchSelfhostedSyncService implements ISelfhostedSyncService {
  readonly _serviceBrand: undefined

  private readonly onStateChangeEmitter = new Emitter<void>()
  readonly onStateChange = this.onStateChangeEmitter.event

  private storage: SelfhostedServerStorage | null = null
  private metadata: ISelfhostedSyncMetadata | null = null
  private syncRequest: Promise<void> | null = null
  private syncTimer: ReturnType<typeof setTimeout> | null = null
  private pendingServerRevision = 0
  private eventStreamController: AbortController | null = null
  private applyingRemoteChanges = false
  private retryAttempt = 0
  private _syncing = false
  private _lastError: string | null = null
  private _lastSyncedAt: number | null = null

  constructor(
    @IConfigService private readonly configService: IConfigService,
    @ITodoService private readonly todoService: ITodoService,
    @IAttachmentUploadService private readonly attachmentService: IAttachmentUploadService,
  ) {
    todoService.onStateChange(() => {
      this.onStateChangeEmitter.fire()
      if (!this.applyingRemoteChanges) {
        this.scheduleSync(LOCAL_CHANGE_DEBOUNCE_MS)
      }
    })
  }

  get enabled(): boolean {
    try {
      return this.todoService.storageId === "local"
    } catch {
      return false
    }
  }

  get showSyncIcon(): boolean {
    return this.enabled && this.hasServer && this.syncEnabled
  }

  get hasServer(): boolean {
    return this.storage !== null && this.metadata !== null && this.enabled
  }

  get showCreateButton(): boolean {
    return this.enabled && !this.hasServer
  }

  get config(): ISelfhostedSyncServerConfig | null {
    return this.configService.get(thirdpartySyncServersConfigKey())
  }

  get syncEnabled(): boolean {
    return this.configService.get(selfhostedSyncEnabledConfigKey())
  }

  get syncing(): boolean {
    return this._syncing
  }

  get lastError(): string | null {
    return this._lastError
  }

  get lastSyncedAt(): number | null {
    return this._lastSyncedAt
  }

  async addServer(config: Omit<ISelfhostedSyncServerConfig, "id">): Promise<string> {
    const folder = config.folder.trim().toLowerCase()
    if (!folder) {
      throw new Error("Folder name is required")
    }
    const newServer: ISelfhostedSyncServerConfig = { ...config, folder, id: generateUuid() }
    const storage = this.createStorage(newServer)
    await storage.status()

    const metadata: ISelfhostedSyncMetadata = {
      clientId: generateUuid(),
      serverRevision: 0,
      snapshotRevision: 0,
      uploadedVersion: {},
    }
    await this.configService.save(thirdpartySyncServersConfigKey(), newServer)
    await this.configService.save(selfhostedSyncEnabledConfigKey(), true)
    await this.configService.save(selfhostedSyncMetadataConfigKey(newServer.id), metadata)
    this.storage = storage
    this.metadata = metadata
    this.pendingServerRevision = 0
    this.startEventStream()
    await this.syncAttachmentStorage(newServer)
    this._lastError = null
    this.onStateChangeEmitter.fire()
    await this.sync()
    return newServer.id
  }

  async updateServer(config: Omit<ISelfhostedSyncServerConfig, "id">): Promise<void> {
    const currentConfig = this.config
    if (!currentConfig || !this.metadata) {
      throw new Error("No sync server configured")
    }
    if (this.syncRequest) {
      await this.syncRequest
    }

    const folder = config.folder.trim().toLowerCase()
    if (!folder) {
      throw new Error("Folder name is required")
    }
    const updatedConfig: ISelfhostedSyncServerConfig = {
      ...config,
      folder,
      id: currentConfig.id,
    }
    const storage = this.createStorage(updatedConfig)
    await storage.status()

    const serverChanged =
      updatedConfig.entrypoint !== currentConfig.entrypoint || updatedConfig.folder !== currentConfig.folder
    const metadata: ISelfhostedSyncMetadata = serverChanged
      ? {
          clientId: generateUuid(),
          serverRevision: 0,
          snapshotRevision: 0,
          uploadedVersion: {},
        }
      : this.metadata

    if (serverChanged) {
      await this.unregisterClient(this.storage, this.metadata.clientId)
    }

    this.stopEventStream()
    this.clearScheduledSync()
    await this.configService.save(thirdpartySyncServersConfigKey(), updatedConfig)
    if (serverChanged) {
      await this.configService.save(selfhostedSyncMetadataConfigKey(updatedConfig.id), metadata)
    }
    this.storage = storage
    this.metadata = metadata
    this.pendingServerRevision = 0
    this.retryAttempt = 0
    this._lastError = null
    this._lastSyncedAt = null
    if (!this.syncEnabled) {
      this.onStateChangeEmitter.fire()
      return
    }
    await this.syncAttachmentStorage(updatedConfig)
    this.startEventStream()
    this.onStateChangeEmitter.fire()
    await this.sync()
  }

  async setSyncEnabled(enabled: boolean): Promise<void> {
    const config = this.config
    if (!config) {
      throw new Error("No sync server configured")
    }
    if (this.syncRequest) {
      await this.syncRequest
    }
    await this.configService.save(selfhostedSyncEnabledConfigKey(), enabled)
    this.clearScheduledSync()
    this.pendingServerRevision = 0
    if (enabled) {
      this._lastError = null
      await this.syncAttachmentStorage(config)
      this.startEventStream()
      this.scheduleSync(0)
    } else {
      this.stopEventStream()
      await this.attachmentService.clearSelfhostedConfig(config.id)
    }
    this.onStateChangeEmitter.fire()
  }

  async removeServer(): Promise<void> {
    const config = this.config
    if (this.syncRequest) {
      await this.syncRequest.catch(() => {
        // Removal must still be possible when the server is unavailable.
      })
    }
    if (this.storage && this.metadata) {
      await this.unregisterClient(this.storage, this.metadata.clientId)
    }
    if (config) {
      await this.attachmentService.clearSelfhostedConfig(config.id)
      await this.configService.save(selfhostedSyncMetadataConfigKey(config.id), null)
    }
    await this.configService.save(thirdpartySyncServersConfigKey(), null)
    await this.configService.save(selfhostedSyncEnabledConfigKey(), true)
    this.storage = null
    this.metadata = null
    this.pendingServerRevision = 0
    this.stopEventStream()
    this._lastError = null
    this._lastSyncedAt = null
    this.clearScheduledSync()
    this.onStateChangeEmitter.fire()
  }

  sync(): Promise<void> {
    if (this.syncRequest) return this.syncRequest
    if (!this.storage || !this.metadata) {
      return Promise.reject(new Error("No sync server configured"))
    }
    if (!this.enabled) {
      return Promise.reject(new Error("Self-hosted sync is only available for the local database"))
    }
    if (!this.syncEnabled) {
      return Promise.reject(new Error("Self-hosted sync is paused"))
    }

    this.clearScheduledSync()
    this._syncing = true
    this.onStateChangeEmitter.fire()
    let succeeded = false
    const request = this.performSync()
      .then(() => {
        succeeded = true
        this.retryAttempt = 0
        this._lastError = null
        this._lastSyncedAt = Date.now()
      })
      .catch((error: unknown) => {
        this._lastError = error instanceof Error ? error.message : String(error)
        this.scheduleRetry()
        throw error
      })
      .finally(() => {
        if (this.syncRequest === request) {
          this.syncRequest = null
        }
        this._syncing = false
        this.onStateChangeEmitter.fire()
        if (succeeded && this.hasPendingSyncWork()) this.scheduleSync(0)
      })
    this.syncRequest = request
    return request
  }

  async init(): Promise<void> {
    const storedConfig = this.config
    if (storedConfig) {
      const config = { ...storedConfig, folder: storedConfig.folder.trim().toLowerCase() }
      if (config.folder !== storedConfig.folder) {
        await this.configService.save(thirdpartySyncServersConfigKey(), config)
      }
      this.storage = this.createStorage(config)
      this.metadata = this.configService.get(selfhostedSyncMetadataConfigKey(config.id))
      if (!this.metadata) {
        this.metadata = {
          clientId: generateUuid(),
          serverRevision: 0,
          snapshotRevision: 0,
          uploadedVersion: {},
        }
        await this.saveMetadata()
      }
      if (this.syncEnabled) {
        await this.syncAttachmentStorage(config)
        this.startEventStream()
      }
    }
    this.installAutoSyncTriggers()
    this.onStateChangeEmitter.fire()
    if (this.hasServer && this.syncEnabled) {
      this.scheduleSync(0)
    }
  }

  private async performSync(): Promise<void> {
    await this.pullRemoteChanges()
    const pushedLocalChanges = await this.pushLocalChanges()
    if (pushedLocalChanges) {
      await this.pullRemoteChanges()
    }
    await this.compactIfNeeded()
  }

  private async pullRemoteChanges(): Promise<void> {
    const storage = this.requireStorage()
    const metadata = this.requireMetadata()
    let cursor = metadata.serverRevision
    while (true) {
      let page
      try {
        page = await storage.changes(cursor, metadata.clientId)
      } catch (error) {
        if (!(error instanceof HttpError && error.status === 409 && error.code === "snapshot_required")) {
          throw error
        }
        const snapshot = await storage.snapshot()
        this.applyingRemoteChanges = true
        try {
          await this.todoService.import([snapshot.payload], this.todoService.storageId)
        } finally {
          this.applyingRemoteChanges = false
        }
        metadata.uploadedVersion = mergeVersions(metadata.uploadedVersion, getPayloadVersion([snapshot.payload]))
        metadata.snapshotRevision = Math.max(metadata.snapshotRevision, snapshot.revision)
        metadata.serverRevision = Math.max(metadata.serverRevision, snapshot.revision)
        cursor = metadata.serverRevision
        await this.saveMetadata()
        continue
      }

      const payloads = page.changes.map((change) => change.payload)

      if (payloads.length > 0) {
        this.applyingRemoteChanges = true
        try {
          await this.todoService.import(payloads, this.todoService.storageId)
        } finally {
          this.applyingRemoteChanges = false
        }
        metadata.uploadedVersion = mergeVersions(metadata.uploadedVersion, getPayloadVersion(payloads))
      }
      cursor = page.nextRevision
      metadata.snapshotRevision = Math.max(metadata.snapshotRevision, page.snapshotRevision)
      metadata.serverRevision = page.hasMore ? page.nextRevision : page.revision
      await this.saveMetadata()
      if (!page.hasMore) break
    }
  }

  private async pushLocalChanges(): Promise<boolean> {
    const storage = this.requireStorage()
    const metadata = this.requireMetadata()
    const currentVersion = this.todoService.getModelVersion(this.todoService.storageId)
    if (!hasVersionBeyond(currentVersion, metadata.uploadedVersion)) {
      return false
    }
    const patch = this.todoService.exportPatch(metadata.uploadedVersion, this.todoService.storageId)
    await storage.appendChange(metadata.clientId, generateUuid(), patch)
    metadata.uploadedVersion = mergeVersions(metadata.uploadedVersion, currentVersion)
    await this.saveMetadata()
    return true
  }

  private async compactIfNeeded(): Promise<void> {
    const storage = this.requireStorage()
    const metadata = this.requireMetadata()
    if (metadata.serverRevision - metadata.snapshotRevision < SNAPSHOT_INTERVAL) {
      return
    }
    const currentVersion = this.todoService.getModelVersion(this.todoService.storageId)
    if (hasVersionBeyond(currentVersion, metadata.uploadedVersion)) {
      return
    }
    const snapshot = this.todoService.exportPatch({}, this.todoService.storageId)
    const status = await storage.putSnapshot(metadata.clientId, metadata.serverRevision, snapshot)
    metadata.snapshotRevision = status.snapshotRevision
    await this.saveMetadata()
  }

  private createStorage(config: ISelfhostedSyncServerConfig): SelfhostedServerStorage {
    return new SelfhostedServerStorage(config.entrypoint, config.authToken, config.folder)
  }

  private async unregisterClient(storage: SelfhostedServerStorage | null, clientId: string): Promise<void> {
    if (!storage) return
    try {
      await storage.deleteClient(clientId)
    } catch {
      // Client leases expire server-side, so a failed best-effort unregister does not pin history forever.
    }
  }

  private async syncAttachmentStorage(serverConfig: ISelfhostedSyncServerConfig): Promise<void> {
    await this.attachmentService.applySelfhostedConfig(serverConfig.id, serverConfig.entrypoint, serverConfig.authToken)
  }

  private requireStorage(): SelfhostedServerStorage {
    if (!this.storage) throw new Error("No sync server configured")
    return this.storage
  }

  private requireMetadata(): ISelfhostedSyncMetadata {
    if (!this.metadata) throw new Error("Sync metadata is not initialized")
    return this.metadata
  }

  private async saveMetadata(): Promise<void> {
    const config = this.config
    if (!config || !this.metadata) return
    await this.configService.save(selfhostedSyncMetadataConfigKey(config.id), this.metadata)
  }

  private installAutoSyncTriggers(): void {
    const trigger = () => {
      if (this.hasServer && this.syncEnabled) this.requestImmediateSync()
    }
    window.addEventListener("online", trigger)
    window.addEventListener("focus", trigger)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") trigger()
    })
    setInterval(trigger, REMOTE_POLL_INTERVAL_MS)
  }

  private scheduleSync(delay: number): void {
    if (!this.storage || !this.metadata || !this.enabled || !this.syncEnabled) return
    this.clearScheduledSync()
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null
      void this.sync().catch(() => {
        // Error state and retry scheduling are handled by sync().
      })
    }, delay)
  }

  private requestImmediateSync(serverRevision?: number): void {
    if (serverRevision !== undefined) {
      const metadata = this.metadata
      if (metadata && serverRevision <= metadata.serverRevision) return
      this.pendingServerRevision = Math.max(this.pendingServerRevision, serverRevision)
    }
    if (this.syncRequest) return
    this.scheduleSync(0)
  }

  private hasPendingSyncWork(): boolean {
    const metadata = this.metadata
    if (!metadata || !this.storage || !this.enabled || !this.syncEnabled) return false

    const hasPendingRemoteChanges = this.pendingServerRevision > metadata.serverRevision
    if (!hasPendingRemoteChanges) {
      this.pendingServerRevision = 0
    }
    const currentVersion = this.todoService.getModelVersion(this.todoService.storageId)
    const hasPendingLocalChanges = hasVersionBeyond(currentVersion, metadata.uploadedVersion)
    return hasPendingRemoteChanges || hasPendingLocalChanges
  }

  private startEventStream(): void {
    this.stopEventStream()
    if (!this.storage || !this.metadata || !this.enabled || !this.syncEnabled) return
    const controller = new AbortController()
    this.eventStreamController = controller
    void this.runEventStream(this.storage, this.metadata.clientId, controller.signal)
  }

  private stopEventStream(): void {
    this.eventStreamController?.abort()
    this.eventStreamController = null
  }

  private async runEventStream(storage: SelfhostedServerStorage, clientId: string, signal: AbortSignal): Promise<void> {
    let retryAttempt = 0
    while (!signal.aborted) {
      let connected = false
      try {
        await storage.subscribeChanges(
          clientId,
          (revision) => this.requestImmediateSync(revision),
          () => {
            connected = true
            retryAttempt = 0
            this.requestImmediateSync()
          },
          signal,
        )
      } catch (error) {
        if (signal.aborted) return
        // WebKit reports ordinary network interruptions as `TypeError: Load failed`.
        // The stream retries with backoff and periodic sync remains active, so this
        // expected disconnect should not surface as a warning in the app console.
        if (!isTransientEventStreamDisconnect(error)) {
          console.warn("Self-hosted sync event stream disconnected:", error)
        }
      }
      if (signal.aborted) return
      const delay = Math.min(1_000 * 2 ** retryAttempt, MAX_EVENT_RECONNECT_DELAY_MS)
      retryAttempt += 1
      if (connected) retryAttempt = 1
      await this.waitForEventReconnect(delay, signal)
    }
  }

  private waitForEventReconnect(delay: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, delay)
      signal.addEventListener("abort", done, { once: true })
      function done() {
        clearTimeout(timer)
        signal.removeEventListener("abort", done)
        resolve()
      }
    })
  }

  private scheduleRetry(): void {
    const delay = Math.min(2_000 * 2 ** this.retryAttempt, MAX_RETRY_DELAY_MS)
    this.retryAttempt += 1
    this.scheduleSync(delay)
  }

  private clearScheduledSync(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
      this.syncTimer = null
    }
  }
}
