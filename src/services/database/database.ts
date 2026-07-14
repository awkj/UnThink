import { localize } from "@/nls"
import { createDecorator } from "@hamsterbase/foundation/instantiation"

export interface IDatabaseMeta {
  account: string
  id: string
  name: string
  salt: string
  accessKey: string
  encryptionKey: string
}
export const LocalDatabaseMeta: IDatabaseMeta = {
  account: "",
  id: "local",
  name: localize("localDatabaseName", "Local Database"),
  salt: "",
  accessKey: "",
  encryptionKey: "",
}

export interface IDatabaseStorage {
  id: string
  load(): Promise<Uint8Array[]>
  append(content: Uint8Array): Promise<void>
  compact(snapshot: Uint8Array): Promise<void>
  entryCount(): Promise<number>
}

export interface IDatabaseService {
  readonly _serviceBrand: undefined

  listDatabases(): Promise<IDatabaseMeta[]>

  getDatabaseMeta(databaseId: string): Promise<IDatabaseMeta>

  deleteDatabase(databaseId: string): Promise<void>

  ensureDatabase(meta: IDatabaseMeta): Promise<void>

  getDatabaseStorage(databaseId: string): Promise<IDatabaseStorage>
}

export const IDatabaseService = createDecorator<IDatabaseService>("IDatabaseService")
