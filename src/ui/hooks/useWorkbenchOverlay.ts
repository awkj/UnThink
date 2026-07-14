import { IWorkbenchOverlayService } from "@/services/overlay/WorkbenchOverlayService"
import { useCallback, useSyncExternalStore } from "react"
import { useService } from "./use-service"

export function useWorkbenchOverlay<T>(overlayId: string): T | null {
  const overlayService = useService(IWorkbenchOverlayService)
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const disposable = overlayService.onOverlayChange(onStoreChange)
      return () => disposable.dispose()
    },
    [overlayService],
  )
  const getSnapshot = useCallback(() => overlayService.getOverlay<T>(overlayId), [overlayId, overlayService])

  return useSyncExternalStore(subscribe, getSnapshot)
}
