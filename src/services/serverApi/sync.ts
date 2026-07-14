import { LocalServerClient } from "./client"

export interface SyncStatus {
  revision: number
  snapshotRevision: number
}

interface SyncServerStatus extends SyncStatus {
  protocol: number
}

export interface SyncChange {
  revision: number
  clientId: string
  changeId: string
  payload: Uint8Array
  createdAt: number
}

export interface SyncSnapshot {
  revision: number
  payload: Uint8Array
  createdAt: number
}

export interface SyncChangesPage {
  revision: number
  nextRevision: number
  snapshotRevision: number
  payloadBytes: number
  hasMore: boolean
  changes: SyncChange[]
}

export interface AppendChangeRequest {
  clientId: string
  changeId: string
  payload: Uint8Array
}

export interface AppendChangeResponse {
  revision: number
  duplicate: boolean
}

export interface PutSnapshotRequest {
  clientId: string
  coversRevision: number
  payload: Uint8Array
}

export class Sync {
  constructor(private client: LocalServerClient) {}

  async status(space: string): Promise<SyncStatus> {
    const status = await this.client.get<SyncServerStatus>(`v1/spaces/${encodeURIComponent(space)}/status`)
    if (status.protocol !== 2) {
      throw new Error(
        `Sync server protocol mismatch: expected version 2, received ${status.protocol ?? "missing"}. ` +
          "Rebuild and redeploy the server and client from the same version.",
      )
    }
    return status
  }

  async changes(
    space: string,
    after: number,
    clientId: string,
    limit = 500,
    maxBytes = 2 << 20,
  ): Promise<SyncChangesPage> {
    const query = new URLSearchParams({
      after: String(after),
      clientId,
      limit: String(limit),
      maxBytes: String(maxBytes),
    })
    const response = await this.client.getCBORSequence<SyncChange>(
      `v1/spaces/${encodeURIComponent(space)}/changes?${query.toString()}`,
    )
    const headerNumber = (name: string) => {
      const value = Number(response.headers[name])
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name} response header`)
      return value
    }
    return {
      revision: headerNumber("x-unthink-revision"),
      nextRevision: headerNumber("x-unthink-next-revision"),
      snapshotRevision: headerNumber("x-unthink-snapshot-revision"),
      payloadBytes: headerNumber("x-unthink-payload-bytes"),
      hasMore: response.headers["x-unthink-has-more"] === "true",
      changes: response.values,
    }
  }

  async appendChange(space: string, request: AppendChangeRequest): Promise<AppendChangeResponse> {
    const responses = await this.client.postCBORSequence<AppendChangeResponse>(
      `v1/spaces/${encodeURIComponent(space)}/changes`,
      [request],
    )
    const response = responses[0]
    if (!response) throw new Error("Append change response is empty")
    return response
  }

  putSnapshot(space: string, request: PutSnapshotRequest): Promise<SyncStatus> {
    return this.client.putCBOR<SyncStatus>(`v1/spaces/${encodeURIComponent(space)}/snapshot`, request)
  }

  snapshot(space: string): Promise<SyncSnapshot> {
    return this.client.getCBOR<SyncSnapshot>(`v1/spaces/${encodeURIComponent(space)}/snapshot`)
  }

  deleteClient(space: string, clientId: string): Promise<void> {
    return this.client.delete(`v1/spaces/${encodeURIComponent(space)}/clients/${encodeURIComponent(clientId)}`)
  }
}
