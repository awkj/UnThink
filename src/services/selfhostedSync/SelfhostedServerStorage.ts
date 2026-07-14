import { LocalServerSDK } from "@/services/serverApi/main"
import { AppendChangeResponse, SyncChangesPage, SyncSnapshot, SyncStatus } from "@/services/serverApi/sync"
import { SelfhostedAttachmentConfig } from "@/services/serverApi/attachments"

export class SelfhostedServerStorage {
  private readonly sdk: LocalServerSDK
  private readonly folder: string

  constructor(
    private readonly entrypoint: string,
    private readonly authToken: string,
    folder: string,
  ) {
    this.folder = folder.trim().toLowerCase()
    this.sdk = new LocalServerSDK({
      endpoint: entrypoint,
      authToken,
      requestLib: LocalServerSDK.fetchToRequestLib(fetch),
    })
  }

  status(): Promise<SyncStatus> {
    return this.sdk.sync.status(this.folder)
  }

  attachmentConfig(): Promise<SelfhostedAttachmentConfig> {
    return this.sdk.attachments.config()
  }

  changes(after: number, clientId: string): Promise<SyncChangesPage> {
    return this.sdk.sync.changes(this.folder, after, clientId)
  }

  snapshot(): Promise<SyncSnapshot> {
    return this.sdk.sync.snapshot(this.folder)
  }

  appendChange(clientId: string, changeId: string, payload: Uint8Array): Promise<AppendChangeResponse> {
    return this.sdk.sync.appendChange(this.folder, { clientId, changeId, payload })
  }

  putSnapshot(clientId: string, coversRevision: number, payload: Uint8Array): Promise<SyncStatus> {
    return this.sdk.sync.putSnapshot(this.folder, { clientId, coversRevision, payload })
  }

  deleteClient(clientId: string): Promise<void> {
    return this.sdk.sync.deleteClient(this.folder, clientId)
  }

  async subscribeChanges(
    clientId: string,
    onRevision: (revision: number) => void,
    onConnected: () => void,
    signal: AbortSignal,
  ): Promise<void> {
    const endpoint = this.entrypoint.replace(/\/$/, "")
    const query = new URLSearchParams({ clientId })
    const response = await fetch(
      `${endpoint}/api/v1/spaces/${encodeURIComponent(this.folder)}/events?${query.toString()}`,
      {
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${this.authToken}`,
        },
        signal,
      },
    )
    if (!response.ok) {
      throw new Error(`Event stream request failed with status ${response.status}`)
    }
    if (!response.body) {
      throw new Error("Event stream response body is unavailable")
    }

    onConnected()
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let eventType = ""
    let dataLines: string[] = []

    const dispatchEvent = () => {
      if (eventType === "revision") {
        const revision = Number(dataLines.join("\n"))
        if (Number.isSafeInteger(revision) && revision >= 0) {
          onRevision(revision)
        }
      }
      eventType = ""
      dataLines = []
    }

    const processLine = (line: string) => {
      if (line === "") {
        dispatchEvent()
        return
      }
      if (line.startsWith(":")) return
      const separator = line.indexOf(":")
      const field = separator === -1 ? line : line.slice(0, separator)
      const rawValue = separator === -1 ? "" : line.slice(separator + 1)
      const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue
      if (field === "event") eventType = value
      if (field === "data") dataLines.push(value)
    }

    try {
      while (true) {
        const { value, done } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        let newline = buffer.indexOf("\n")
        while (newline !== -1) {
          const line = buffer.slice(0, newline).replace(/\r$/, "")
          buffer = buffer.slice(newline + 1)
          processLine(line)
          newline = buffer.indexOf("\n")
        }
        if (done) {
          if (buffer.length > 0) processLine(buffer.replace(/\r$/, ""))
          dispatchEvent()
          return
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
