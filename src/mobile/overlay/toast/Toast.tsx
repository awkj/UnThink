import { useService } from "@/ui/hooks/use-service"
import { useWatchEvent } from "@/ui/hooks/use-watch-event"
import { MobileTestIds } from "@/mobile/testids"
import { OverlayEnum } from "@/services/overlay/overlayEnum"
import { IWorkbenchOverlayService } from "@/services/overlay/WorkbenchOverlayService"
import React, { useEffect, useState } from "react"
import { ToastController } from "./ToastController"
import classNames from "classnames"

export const Toast: React.FC = () => {
  const workbenchOverlayService = useService(IWorkbenchOverlayService)
  useWatchEvent(workbenchOverlayService.onOverlayChange)
  const toastController: ToastController | null = workbenchOverlayService.getOverlay(OverlayEnum.toast)
  useWatchEvent(toastController?.onStatusChange)

  if (!toastController) return null
  return <ToastContent controller={toastController} />
}

const ToastContent: React.FC<{ controller: ToastController }> = ({ controller: toastController }) => {
  const [isVisible, setIsVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10)
    return () => clearTimeout(timer)
  }, [])

  const toastMessage = (
    <div
      data-testid={MobileTestIds.Toast.Root}
      className={classNames(
        "fixed left-1/2",
        "bg-toast-bg text-white rounded-md max-w-70 px-3 py-2 text-center text-sm w-max",
        "transition-opacity duration-300 ease-in-out",
        {
          "mt-48 top-0": toastController.position === "top",
          "top-1/2": toastController.position === "center",
        },
        isVisible ? "opacity-100" : "opacity-0",
      )}
      style={{
        pointerEvents: "none",
        zIndex: toastController.zIndex,
        transform: toastController.position === "center" ? "translate(-50%, -50%)" : "translateX(-50%)",
      }}
    >
      {toastController.message}
    </div>
  )
  if (toastController.forbidClick) {
    return (
      <div
        data-testid={MobileTestIds.Toast.Root}
        className={classNames("fixed inset-0 flex items-center justify-center")}
        style={{
          zIndex: toastController.zIndex,
        }}
      >
        {toastMessage}
      </div>
    )
  }
  return toastMessage
}
