import {
  CloseIcon,
  CloudSlashIcon,
  FileIcon,
  ImageIcon,
  LoaderCircle,
  PlusIcon,
  RightArrowIcon,
} from "@/ui/components/icons"
import { AttachmentSchema } from "@/core/type"
import { useDesktopDialog } from "@/desktop/overlay/desktopDialog/useDesktopDialog"
import { useImagePreviewOverlay } from "@/desktop/overlay/imagePreview/useImagePreviewOverlay"
import { desktopStyles } from "@/desktop/theme/main"
import { useService } from "@/ui/hooks/use-service"
import { useWatchEvent } from "@/ui/hooks/use-watch-event"
import { localize } from "@/nls"
import { IAttachmentUploadService, UploadItem } from "@/services/attachment/attachmentUploadService"
import classNames from "classnames"
import React, { useEffect, useRef, useState } from "react"
import { Link, useLocation } from "react-router"

interface AttachmentSectionProps {
  parentUid: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function isImageMimetype(mimetype: string): boolean {
  return mimetype.startsWith("image/")
}

const FILENAME_TAIL_LENGTH = 12

function splitFilename(filename: string): { head: string; tail: string } {
  if (filename.length <= FILENAME_TAIL_LENGTH + 4) {
    return { head: filename, tail: "" }
  }
  return {
    head: filename.slice(0, -FILENAME_TAIL_LENGTH),
    tail: filename.slice(-FILENAME_TAIL_LENGTH),
  }
}

const FilenameText: React.FC<{ filename: string; className?: string }> = ({ filename, className }) => {
  const { head, tail } = splitFilename(filename)
  if (!tail) {
    return <span className={className}>{head}</span>
  }
  return (
    <span className={classNames(desktopStyles.AttachmentFilenameWrapper, className)}>
      <span className={desktopStyles.AttachmentFilenameHead}>{head}</span>
      <span className={desktopStyles.AttachmentFilenameTail}>{tail}</span>
    </span>
  )
}

const ThumbImage: React.FC<{ s3Key: string; filename: string }> = ({ s3Key, filename }) => {
  const attachmentService = useService(IAttachmentUploadService)
  type ThumbnailState =
    | { key: string; status: "loading" }
    | { key: string; status: "ready"; url: string }
    | { key: string; status: "failed" }
  const [storedState, setState] = useState<ThumbnailState>({ key: s3Key, status: "loading" })
  const state: ThumbnailState = storedState.key === s3Key ? storedState : { key: s3Key, status: "loading" }

  useEffect(() => {
    let revoked = false
    let createdUrl: string | null = null
    void attachmentService.getThumbnailUrl(s3Key).then((u) => {
      if (revoked) {
        if (u) URL.revokeObjectURL(u)
        return
      }
      if (u) {
        createdUrl = u
        setState({ key: s3Key, status: "ready", url: u })
      } else {
        setState({ key: s3Key, status: "failed" })
      }
    })
    return () => {
      revoked = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [s3Key, attachmentService])

  if (state.status === "loading") {
    return <LoaderCircle className={desktopStyles.AttachmentRowThumbLoading} strokeWidth={1.5} />
  }
  if (state.status === "failed") {
    return <ImageIcon className={desktopStyles.AttachmentRowThumbIcon} strokeWidth={1.5} />
  }
  return <img src={state.url} alt={filename} className={desktopStyles.AttachmentRowThumbImage} />
}

const TypePlaceholder: React.FC<{ mimetype?: string }> = ({ mimetype }) => {
  const Icon = mimetype && mimetype.startsWith("image/") ? ImageIcon : FileIcon
  return <Icon className={desktopStyles.AttachmentRowThumbIcon} strokeWidth={1.5} />
}

const AttachmentRow: React.FC<{
  attachment: AttachmentSchema
  disabled: boolean
  onPrimaryClick: () => void
  onDelete: () => void
}> = ({ attachment, disabled, onPrimaryClick, onDelete }) => {
  return (
    <div
      className={classNames(desktopStyles.AttachmentRow, disabled && desktopStyles.AttachmentRowDisabled)}
      title={attachment.filename}
      onClick={() => {
        if (!disabled) onPrimaryClick()
      }}
    >
      <div className={desktopStyles.AttachmentRowThumb}>
        {attachment.hasThumbnail && !disabled ? (
          <ThumbImage s3Key={attachment.s3Key} filename={attachment.filename} />
        ) : (
          <TypePlaceholder mimetype={attachment.mimetype} />
        )}
      </div>
      <div className={desktopStyles.AttachmentRowContent}>
        <FilenameText filename={attachment.filename} className={desktopStyles.AttachmentRowFilename} />
        <span className={desktopStyles.AttachmentRowSize}>{formatSize(attachment.size)}</span>
      </div>
      <button
        type="button"
        className={desktopStyles.AttachmentRowDeleteButton}
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        title={localize("attachments.delete")}
      >
        <CloseIcon className={desktopStyles.AttachmentRowDeleteIcon} strokeWidth={1.5} />
      </button>
    </div>
  )
}

const UploadRow: React.FC<{
  upload: UploadItem
  onCancel: () => void
  onRetry: () => void
}> = ({ upload, onCancel, onRetry }) => {
  const isFailed = upload.status === "failed"
  const percent = Math.round(upload.progress * 100)
  return (
    <div
      className={classNames(
        desktopStyles.AttachmentRow,
        isFailed ? desktopStyles.AttachmentRowFailed : desktopStyles.AttachmentRowUploading,
      )}
      title={upload.filename}
    >
      <div className={desktopStyles.AttachmentRowThumb}>
        <TypePlaceholder />
      </div>
      <div className={desktopStyles.AttachmentRowContent}>
        <FilenameText filename={upload.filename} className={desktopStyles.AttachmentRowFilename} />
        {isFailed ? (
          <span className={desktopStyles.AttachmentRowError}>
            {upload.error ?? localize("attachments.uploadFailed")}
          </span>
        ) : (
          <span className={desktopStyles.AttachmentRowSize}>
            {localize("attachments.uploading")} {percent}% · {formatSize(upload.size)}
          </span>
        )}
      </div>
      {isFailed && (
        <button type="button" className={desktopStyles.AttachmentRowRetryButton} onClick={onRetry}>
          {localize("attachments.retry")}
        </button>
      )}
      <button
        type="button"
        className={desktopStyles.AttachmentRowDeleteButton}
        onClick={onCancel}
        title={localize("common.cancel")}
      >
        <CloseIcon className={desktopStyles.AttachmentRowDeleteIcon} strokeWidth={1.5} />
      </button>
      {!isFailed && (
        <div className={desktopStyles.AttachmentRowProgressBar}>
          <div className={desktopStyles.AttachmentRowProgressFill} style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  )
}

export const AttachmentSection: React.FC<AttachmentSectionProps> = ({ parentUid }) => {
  const location = useLocation()
  const attachmentService = useService(IAttachmentUploadService)
  useWatchEvent(attachmentService.onChange)
  const dialog = useDesktopDialog()
  const openImagePreview = useImagePreviewOverlay()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const config = attachmentService.getConfig()
  const attachments = attachmentService.listAttachmentsByParent(parentUid)
  const uploads = attachmentService.getUploadsForParent(parentUid)

  const hasConfig = !!config
  const hasItems = attachments.length > 0 || uploads.length > 0

  if (!hasConfig && !hasItems) {
    return null
  }

  const handleFilesPicked = (files: FileList | null) => {
    if (!files || files.length === 0) return
    attachmentService.uploadFiles(Array.from(files), parentUid)
  }

  const handleDelete = (attachment: AttachmentSchema) => {
    dialog({
      title: localize("attachments.deleteConfirmTitle"),
      description: localize("attachments.deleteConfirmDescription", { 0: attachment.filename }),
      confirmText: localize("attachments.delete"),
      cancelText: localize("common.cancel"),
      onConfirm: async () => {
        attachmentService.softDelete(attachment.id)
      },
    })
  }

  const totalCount = attachments.length

  return (
    <div className={desktopStyles.AttachmentSectionContainer}>
      <div className={desktopStyles.AttachmentSectionHeader}>
        <span className={desktopStyles.AttachmentSectionTitle}>{localize("attachments.heading")}</span>
        {totalCount > 0 && (
          <span className={desktopStyles.AttachmentSectionMeta}>
            {hasConfig ? totalCount : `${totalCount} · ${localize("attachments.notConfiguredStatus")}`}
          </span>
        )}
      </div>

      {!hasConfig && hasItems && (
        <div className={desktopStyles.AttachmentSectionWarning}>
          <CloudSlashIcon className={desktopStyles.AttachmentSectionWarningIcon} strokeWidth={1.75} />
          <span className={desktopStyles.AttachmentSectionWarningText}>
            {localize("attachments.notConfiguredWarning")}
          </span>
          <Link
            to="/settings/selfhosted-sync"
            state={{ settingsBackgroundLocation: `${location.pathname}${location.search}${location.hash}` }}
            className={desktopStyles.AttachmentSectionWarningLink}
          >
            <span>{localize("attachments.configureAction")}</span>
            <RightArrowIcon className={desktopStyles.AttachmentSectionWarningLinkArrow} strokeWidth={1.75} />
          </Link>
        </div>
      )}

      {hasItems && (
        <div className={desktopStyles.AttachmentList}>
          {uploads.map((upload) => (
            <UploadRow
              key={upload.id}
              upload={upload}
              onCancel={() => attachmentService.cancelUpload(upload.id)}
              onRetry={() => attachmentService.retryUpload(upload.id)}
            />
          ))}
          {attachments.map((attachment) => (
            <AttachmentRow
              key={attachment.id}
              attachment={attachment}
              disabled={!hasConfig}
              onPrimaryClick={() => {
                if (isImageMimetype(attachment.mimetype)) {
                  openImagePreview({ attachment })
                } else {
                  void attachmentService.downloadAttachment(attachment.s3Key, attachment.filename)
                }
              }}
              onDelete={() => handleDelete(attachment)}
            />
          ))}
        </div>
      )}

      {hasConfig && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={desktopStyles.SubtaskListCreateButton}
          >
            <span className={desktopStyles.SubtaskListCreateButtonIconContainer}>
              <PlusIcon className={desktopStyles.SubtaskListCreateButtonIcon} />
            </span>
            <span className={desktopStyles.SubtaskListCreateButtonLabel}>{localize("attachments.add")}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFilesPicked(e.target.files)
              e.target.value = ""
            }}
          />
        </>
      )}
    </div>
  )
}
