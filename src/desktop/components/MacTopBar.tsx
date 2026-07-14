import { checkPlatform } from "@/ui/browser/checkPlatform"
import { LeftIcon, RightIcon } from "@/ui/components/icons"
import { desktopStyles } from "@/desktop/theme/main"
import classNames from "classnames"
import React, { useCallback, useSyncExternalStore } from "react"
import { useLocation, useNavigate } from "react-router"

const getHistoryIdx = () => (window.history.state?.idx as number | undefined) ?? 0

export const MacTopBar: React.FC = () => {
  const { isTauri, isMac } = checkPlatform()
  const navigate = useNavigate()
  useLocation()
  const subscribe = useCallback((update: () => void) => {
    window.addEventListener("popstate", update)
    return () => window.removeEventListener("popstate", update)
  }, [])
  const historyIndex = useSyncExternalStore(subscribe, getHistoryIdx, () => 0)
  const canGoBack = historyIndex > 0
  const canGoForward = historyIndex < window.history.length - 1

  if (!(isTauri && isMac)) {
    return null
  }

  return (
    <div className={desktopStyles.MacTopBarContainer}>
      <div
        className={desktopStyles.MacTopBarDragRegion}
        data-tauri-drag-region
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />
      <div
        className={desktopStyles.MacTopBarControlRegion}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={() => canGoBack && navigate(-1)}
          disabled={!canGoBack}
          className={classNames(
            desktopStyles.SidebarHeaderIconButton,
            !canGoBack && desktopStyles.MacTopBarButtonDisabled,
          )}
        >
          <LeftIcon className={desktopStyles.SidebarHeaderIconButtonIcon} />
        </button>
        <button
          type="button"
          onClick={() => canGoForward && navigate(1)}
          disabled={!canGoForward}
          className={classNames(
            desktopStyles.SidebarHeaderIconButton,
            !canGoForward && desktopStyles.MacTopBarButtonDisabled,
          )}
        >
          <RightIcon className={desktopStyles.SidebarHeaderIconButtonIcon} />
        </button>
      </div>
    </div>
  )
}
