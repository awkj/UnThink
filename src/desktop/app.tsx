import { checkPlatform } from "@/ui/browser/checkPlatform"
import { SidebarLayout } from "@/desktop/components/SidebarLayout/SidebarLayout.tsx"
import { SettingsModal } from "@/desktop/components/SettingsModal/SettingsModal"
import { desktopStyles } from "@/desktop/theme/main"
import { ImagePreviewOverlay } from "@/desktop/overlay/imagePreview/ImagePreviewOverlay"
import { DatePickerOverlay } from "@/desktop/overlay/datePicker/DatePickerOverlay"
import { DesktopDialog } from "@/desktop/overlay/desktopDialog/DesktopDialog"
import { DesktopMenu } from "@/desktop/overlay/desktopMenu/DesktopMenu.tsx"
import { DesktopMessage } from "@/desktop/overlay/desktopMessage/DesktopMessage"
import { CommandPaletteOverlay } from "@/desktop/overlay/commandPalette/CommandPaletteOverlay"
import { RecurringTaskSettingsOverlay } from "@/desktop/overlay/recurringTaskSettings/RecurringTaskSettingsOverlay"
import { TagEditorOverlay } from "@/desktop/overlay/tagEditor/TagEditorOverlay"
import { TimePickerOverlay } from "@/desktop/overlay/timePicker/TimePickerOverlay"
import { TreeSelectOverlay } from "@/desktop/overlay/treeSelect/TreeSelectOverlay"
import { useInputFocused } from "@/ui/hooks/global/useInputFocused"
import { useService } from "@/ui/hooks/use-service"
import { useSafeArea } from "@/ui/hooks/useSafeArea"
import { IMenuService } from "@/services/menu/menuService"
import { INavigationService } from "@/services/navigationService/navigationService"
import { ITodoService } from "@/services/todo/todoService"
import React, { lazy, Suspense, useEffect } from "react"
import { Navigate, useRoutes, useLocation, useNavigate } from "react-router"

const AreaPage = lazy(() => import("@/desktop/pages/area").then((module) => ({ default: module.AreaPage })))
const Completed = lazy(() => import("@/desktop/pages/completed").then((module) => ({ default: module.Completed })))
const Pending = lazy(() => import("@/desktop/pages/builtInViews").then((module) => ({ default: module.Pending })))
const Deleted = lazy(() => import("@/desktop/pages/deleted").then((module) => ({ default: module.Deleted })))
const Guide = lazy(() => import("@/desktop/pages/guide").then((module) => ({ default: module.Guide })))
const FutureProjects = lazy(() =>
  import("@/desktop/pages/futureProjects").then((module) => ({ default: module.FutureProjects })),
)
const Inbox = lazy(() => import("@/desktop/pages/inbox").then((module) => ({ default: module.Inbox })))
const ProjectPage = lazy(() => import("@/desktop/pages/project").then((module) => ({ default: module.ProjectPage })))
const Schedule = lazy(() => import("@/desktop/pages/schedule").then((module) => ({ default: module.Schedule })))
const AppearanceSettings = lazy(() =>
  import("@/desktop/pages/settings-page/AppearanceSettings").then((module) => ({
    default: module.AppearanceSettings,
  })),
)
const ImportExportSettings = lazy(() =>
  import("@/desktop/pages/settings-page/ImportExportSettings").then((module) => ({
    default: module.ImportExportSettings,
  })),
)
const SelfHostedSyncSettings = lazy(() =>
  import("@/desktop/pages/settings-page/sync/SelfHostedSyncSettings.tsx").then((module) => ({
    default: module.SelfHostedSyncSettings,
  })),
)
const AISettings = lazy(() =>
  import("@/desktop/pages/settings-page/AISettings").then((module) => ({ default: module.AISettings })),
)
const Today = lazy(() => import("@/desktop/pages/today/today.tsx").then((module) => ({ default: module.Today })))
const AIChat = lazy(() => import("@/desktop/pages/ai-chat").then((module) => ({ default: module.AIChat })))
const ViewDetailPage = lazy(() =>
  import("@/desktop/pages/views").then((module) => ({ default: module.ViewDetailPage })),
)

const DesktopNavigationBridge: React.FC = () => {
  const navigate = useNavigate()
  const navigationService = useService(INavigationService)

  useEffect(() => {
    const backDisposable = navigationService.onGoBack(() => {
      if (window.history.state && window.history.state.idx > 0) {
        navigate(-1)
      }
    })

    const forwardDisposable = navigationService.onGoForward(() => {
      navigate(1)
    })

    return () => {
      backDisposable.dispose()
      forwardDisposable.dispose()
    }
  }, [navigate, navigationService])

  return null
}

export const App = () => {
  useInputFocused()
  const { isTauri } = checkPlatform()

  const location = useLocation()
  const menuService = useService(IMenuService)
  const todoService = useService(ITodoService)
  useEffect(() => {
    todoService.clearUndoHistory()
  }, [location.pathname, todoService])

  useEffect(() => {
    menuService.updateMenu()
  }, [menuService])

  useSafeArea()

  const settingsBackgroundLocation = (location.state as { settingsBackgroundLocation?: string } | null)
    ?.settingsBackgroundLocation
  const isSettingsOpen = location.pathname.startsWith("/settings")
  const contentLocation = isSettingsOpen ? (settingsBackgroundLocation ?? "/inbox") : location

  const element = useRoutes(
    [
      {
        path: "/",
        children: [
          {
            path: "",
            element: <SidebarLayout />,
            children: [
              {
                index: true,
                element: <Navigate to="inbox" replace />,
              },
              {
                path: "ai-chat",
                element: <AIChat />,
              },
              {
                path: "inbox",
                element: <Inbox />,
              },
              {
                path: "today",
                element: <Today />,
              },
              {
                path: "scheduled",
                element: <Schedule />,
              },
              {
                path: "pending",
                element: <Pending />,
              },
              {
                path: "completed",
                element: <Completed />,
              },
              {
                path: "deleted",
                element: <Deleted />,
              },
              {
                path: "future_projects",
                element: <FutureProjects />,
              },
              {
                path: "area/:areaUid",
                element: <AreaPage />,
              },
              {
                path: "project/:projectUid",
                element: <ProjectPage />,
              },
              {
                path: "views/:viewUid",
                element: <ViewDetailPage />,
              },
            ],
          },
        ],
      },
      {
        path: "*",
        element: <Navigate to="/inbox" replace />,
      },
    ],
    contentLocation,
  )

  const settingsElement = useRoutes([
    {
      path: "/settings",
      element: <SettingsModal />,
      children: [
        {
          index: true,
          element: <Navigate to="appearance" replace state={location.state} />,
        },
        {
          path: "appearance",
          element: <AppearanceSettings />,
        },
        {
          path: "selfhosted-sync",
          element: <SelfHostedSyncSettings />,
        },
        {
          path: "import-export",
          element: <ImportExportSettings />,
        },
        {
          path: "ai",
          element: <AISettings />,
        },
        {
          path: "guide",
          element: <Guide />,
        },
      ],
    },
    {
      path: "*",
      element: null,
    },
  ])

  return (
    <div>
      {isTauri && (
        <div
          className={desktopStyles.DragBar}
          data-tauri-drag-region
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
      )}
      <DesktopNavigationBridge />
      <div inert={isSettingsOpen} aria-hidden={isSettingsOpen}>
        <Suspense fallback={null}>{element}</Suspense>
      </div>
      <Suspense fallback={null}>{settingsElement}</Suspense>
      <DesktopMenu />
      <DatePickerOverlay />
      <TimePickerOverlay />
      <TagEditorOverlay />
      <RecurringTaskSettingsOverlay />
      <DesktopDialog />
      <DesktopMessage />
      <ImagePreviewOverlay />
      <TreeSelectOverlay />
      <CommandPaletteOverlay />
    </div>
  )
}
