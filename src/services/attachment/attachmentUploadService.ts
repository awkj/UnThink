import { AttachmentSchema } from "@/core/type"
import { Event } from "@hamsterbase/foundation/event"
import { createDecorator } from "@hamsterbase/foundation/instantiation"

export interface S3Config {
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  keyPrefix?: string
  forcePathStyle?: boolean
}

export interface SelfhostedAttachmentStorageConfig {
  transport: "selfhosted"
  endpoint: string
  authToken: string
  managedBySelfhostedServerId: string
}

export type AttachmentStorageConfig = S3Config | SelfhostedAttachmentStorageConfig

export function isSelfhostedAttachmentConfig(
  config: AttachmentStorageConfig,
): config is SelfhostedAttachmentStorageConfig {
  return "transport" in config && config.transport === "selfhosted"
}

export interface TestConnectionResult {
  ok: boolean
  error?: string | undefined
}

export type UploadStatus = "queued" | "uploading" | "failed"

export interface UploadItem {
  id: string
  parentUid: string
  filename: string
  size: number
  mimetype: string
  progress: number
  status: UploadStatus
  error?: string | undefined
}

export interface IAttachmentUploadService {
  readonly _serviceBrand: undefined
  onChange: Event<void>

  getConfig(): AttachmentStorageConfig | null
  setConfig(config: S3Config | null): Promise<void>
  applySelfhostedConfig(serverId: string, endpoint: string, authToken: string): Promise<boolean>
  clearSelfhostedConfig(serverId: string): Promise<void>
  testConnection(config: S3Config): Promise<TestConnectionResult>

  uploadFiles(files: File[], parentUid: string): void
  cancelUpload(uploadId: string): void
  retryUpload(uploadId: string): void

  getActiveUploadCount(): number
  getUploadsForParent(parentUid: string): UploadItem[]
  cancelAllUploads(): Promise<void>

  listAttachmentsByParent(parentUid: string): AttachmentSchema[]
  softDelete(attachmentId: string): void

  getThumbnailUrl(s3Key: string): Promise<string | null>
  getObjectUrl(s3Key: string): Promise<string | null>
  downloadAttachment(s3Key: string, filename: string): Promise<void>
}

export const IAttachmentUploadService = createDecorator<IAttachmentUploadService>("IAttachmentUploadService")
