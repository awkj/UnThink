import { desktopStyles } from "@/desktop/theme/main"
import { localize } from "@/nls"
import { TestIds } from "@/testIds"
import { checkPlatform } from "@/ui/browser/checkPlatform"
import { CloseIcon } from "@/ui/components/icons"
import React, { useCallback, useEffect, useRef } from "react"
import { Outlet, useLocation, useNavigate } from "react-router"
import { SettingsNavigation } from "../SettingsNavigation/SettingsNavigation"

type SettingsLocationState = {
  settingsBackgroundLocation?: string
}

export const SettingsModal: React.FC = () => {
  const { isTauri } = checkPlatform()
  const location = useLocation()
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLElement>(null)
  const backgroundLocation = (location.state as SettingsLocationState | null)?.settingsBackgroundLocation

  const close = useCallback(() => {
    if (backgroundLocation && window.history.state?.idx > 0) {
      navigate(-1)
      return
    }

    navigate(backgroundLocation ?? "/inbox", { replace: true })
  }, [backgroundLocation, navigate])

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        close()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      previouslyFocusedElement?.focus()
    }
  }, [close])

  return (
    <div className={desktopStyles.SettingsModalRoot}>
      <button
        type="button"
        className={desktopStyles.SettingsModalBackdrop}
        tabIndex={-1}
        aria-hidden="true"
        onClick={close}
      />
      <section
        ref={dialogRef}
        className={desktopStyles.SettingsModalSurface}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        data-test-id={TestIds.Settings.Modal}
      >
        {isTauri && (
          <div
            className={desktopStyles.SettingsModalDragRegion}
            data-tauri-drag-region
            style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
          />
        )}
        <button
          type="button"
          className={desktopStyles.SettingsModalCloseButton}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          aria-label={localize("common.close")}
          data-test-id={TestIds.Settings.CloseButton}
          onClick={close}
        >
          <CloseIcon className={desktopStyles.SettingsModalCloseIcon} strokeWidth={1.75} />
        </button>
        <div className={desktopStyles.SettingsModalBody}>
          <SettingsNavigation />
          <main className={desktopStyles.SettingsModalContent}>
            <Outlet />
          </main>
        </div>
      </section>
    </div>
  )
}
