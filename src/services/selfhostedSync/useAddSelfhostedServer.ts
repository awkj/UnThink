import { DialogAction, DialogActionValue } from "@/ui/types/dialog"
import { useService } from "@/ui/hooks/use-service"
import { useWatchEvent } from "@/ui/hooks/use-watch-event"
import { localize } from "@/nls"
import { ISelfhostedSyncService } from "./selfhostedSyncService"

interface AddServerDialog {
  title: string
  actions: DialogAction[]
  onConfirm(values: DialogActionValue): Promise<void>
}

interface UseAddSelfhostedServerOptions {
  toast(type: "success" | "error", message: string): void
  handleAddServerDialog(options: AddServerDialog): void
}

export const selfhostedSyncPageTitle = localize("sync.selfHostedSync", "Selfhosted Sync")

export const useAddSelfhostedServer = (options: UseAddSelfhostedServerOptions) => {
  const selfhostedSyncService = useService(ISelfhostedSyncService)
  useWatchEvent(selfhostedSyncService.onStateChange)

  const title = localize("sync.selfHosted.add", "Add Selfhosted Server")
  const isValidUrl = (url: string): string | undefined => {
    try {
      new URL(url)
      return undefined
    } catch {
      return localize("sync.error.invalidEndpoint", "Please enter a valid URL")
    }
  }
  const actions: DialogAction[] = [
    {
      key: "endpoint",
      type: "input",
      label: localize("sync.endpoint", "Endpoint"),
      placeholder: "https://your-server.com",
      inputType: "url",
      required: true,
      validation: isValidUrl,
    },
    {
      key: "authToken",
      type: "input",
      label: localize("sync.authToken", "Auth Token"),
      placeholder: localize("sync.authTokenPlaceholder", "Enter your authentication token"),
      inputType: "password",
      required: true,
    },
    {
      key: "folderName",
      type: "input",
      label: localize("sync.folderName", "Folder Name"),
      placeholder: localize("sync.folderNamePlaceholder", "tasks"),
      required: true,
    },
  ] as const

  const addButtonLabel = localize("sync.selfHosted.add", "Add Selfhosted Server")

  const syncButtonLabel = selfhostedSyncService.syncing
    ? localize("sync.syncing", "Syncing...")
    : localize("sync.syncNow", "Sync Now")

  const emptyStateMessage = localize(
    "sync.selfHostedNoConfigDescription",
    "No server configured yet. Add one to sync tasks across devices.",
  )

  const disabledStateMessage = localize(
    "sync.selfHostedOnlyLocalDatabase",
    "Selfhosted sync is only available for local database.",
  )

  const formItemsLabel = {
    serverType: localize("sync.serverType", "Server Type"),
    endpoint: localize("sync.endpoint", "Endpoint"),
    selfHosted: localize("sync.selfHostedServer", "Selfhosted Server"),
    authToken: localize("sync.authToken", "Auth Token"),
    folderName: localize("sync.folderName", "Folder Name"),
  }

  const handleDeleteServer = async () => {
    try {
      await selfhostedSyncService.deleteServer()
      options.toast("success", localize("sync.deleteConfigSuccess", "Sync disconnected"))
    } catch (error) {
      options.toast("error", (error as Error).message)
    }
  }

  const handleSync = async () => {
    if (selfhostedSyncService.syncing) return
    try {
      await selfhostedSyncService.sync()
      options.toast("success", localize("sync.syncSuccess", "Sync Successful"))
    } catch (error) {
      options.toast("error", (error as Error).message)
    }
  }

  const onAddServer = () => {
    options.handleAddServerDialog({
      title: title,
      actions: actions,
      onConfirm: async (values) => {
        try {
          await selfhostedSyncService.addServer({
            type: "selfhosted",
            folder: values.folderName as string,
            entrypoint: values.endpoint as string,
            authToken: values.authToken as string,
          })
          options.toast("success", localize("sync.addServerSuccess", "Server added successfully"))
        } catch (error) {
          options.toast("error", (error as Error).message)
          throw error
        }
      },
    })
  }

  const deleteButtonLabel = localize("sync.deleteServer", "Disconnect Sync")

  return {
    title,
    actions,
    pageTitle: localize("sync.selfHostedSync", "Selfhosted Sync"),
    addButtonLabel,
    syncButtonLabel,
    emptyStateMessage,
    disabledStateMessage,
    formItemsLabel,
    deleteButtonLabel,
    handleDeleteServer,
    handleSync,
    onAddServer,
  }
}
