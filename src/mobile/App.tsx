import { useService } from "@/ui/hooks/use-service"
import { useSafeArea } from "@/ui/hooks/useSafeArea"
import { DatePickerActionSheet } from "@/mobile/overlay/datePicker/DatePickerActionSheet.tsx"
import { TimePickerActionSheet } from "@/mobile/overlay/timePicker/TimePickerActionSheet"
import { Dialog } from "@/mobile/overlay/dialog/Dialog"
import { PopupActionSheet } from "@/mobile/overlay/popupAction/PopupActionSheet"
import { TagEditorActionSheet } from "@/mobile/overlay/tagEditor/TagEditorActionSheet"
import { TaskDisplaySettings } from "@/mobile/overlay/taskDisplaySettings/TaskDisplaySettings"
import { RecurringTaskSettings } from "@/mobile/overlay/recurringTaskSettings/RecurringTaskSettings"
import { pages } from "@/mobile/pages.tsx"
import { INavigationService } from "@/services/navigationService/navigationService"
import { useEffect, useRef } from "react"
import { BrowserRouter, HashRouter, Navigate, Outlet, Route, Routes, useNavigate } from "react-router"
import { checkPlatform } from "@/ui/browser/checkPlatform"
import { Toast } from "./overlay/toast/Toast"
import { ProjectAreaSelector } from "./overlay/projectAreaSelector/ProjectAreaSelector"

const ContentNavigation = () => {
  const navigate = useNavigate()
  const navigationService = useService(INavigationService)
  useEffect(() => {
    const listener = navigationService.listenBackButton(() => {
      if (window.history.state && window.history.state.idx > 0) {
        navigate(-1)
      } else {
        if ("__TAURI_INTERNALS__" in window) {
          void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().close())
        }
      }
    })
    return () => {
      listener.dispose()
    }
  }, [navigate, navigationService])
  const hiddenInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const navigationSubscription = navigationService.onNavigate((e) => {
      if (e.path === "/create_task") {
        hiddenInputRef.current?.focus()
        navigate(e.path, { replace: e.replace })
      } else {
        navigate(e.path, { replace: e.replace })
      }
    })
    return () => {
      navigationSubscription.dispose()
    }
  }, [navigationService, navigate])
  return (
    <div>
      <div style={{ maxHeight: 0, overflow: "hidden" }}>
        <input ref={hiddenInputRef}></input>
      </div>
      <Outlet></Outlet>
    </div>
  )
}

export const App = () => {
  useSafeArea()
  const Router = checkPlatform().isTauri ? HashRouter : BrowserRouter

  return (
    <div>
      <DatePickerActionSheet></DatePickerActionSheet>
      <TimePickerActionSheet></TimePickerActionSheet>
      <Dialog></Dialog>
      <Toast></Toast>
      <TagEditorActionSheet></TagEditorActionSheet>
      <PopupActionSheet></PopupActionSheet>
      <TaskDisplaySettings></TaskDisplaySettings>
      <ProjectAreaSelector></ProjectAreaSelector>
      <RecurringTaskSettings></RecurringTaskSettings>
      <Router>
        <Routes>
          <Route element={<ContentNavigation></ContentNavigation>}>
            {pages.map((page) => (
              <Route key={page.url} path={page.url} element={page.content} />
            ))}
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Route>
        </Routes>
      </Router>
    </div>
  )
}
