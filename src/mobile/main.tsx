import { checkPlatform } from "@/ui/browser/checkPlatform.ts"
import { initializeTheme, watchThemeChange } from "@/ui/browser/initializeTheme.ts"
import { initKeyboardListeners } from "@/ui/browser/initKeyboardListeners.ts"
import { LocalStorageConfigStore } from "@/services/config/localStorageConfigStore.ts"
import { IConfigService, WorkbenchConfig } from "@/services/config/configService.ts"
import { BrowserDatabaseService } from "@/services/database/opfsDatabaseService.ts"
import { IDatabaseService, LocalDatabaseMeta } from "@/services/database/database.ts"
import { TauriFsDatabaseService } from "@/services/database/tauriFsDatabaseService.ts"
import { INavigationService, NavigationService } from "@/services/navigationService/navigationService.ts"
import { IReminderService } from "@/services/reminders/reminderService.ts"
import { MobileReminderService } from "@/services/reminders/mobileReminderService.ts"
import { ISelfhostedSyncService } from "@/services/selfhostedSync/selfhostedSyncService.ts"
import { WorkbenchSelfhostedSyncService } from "@/services/selfhostedSync/workbenchSelfhostedSyncService.ts"
import { IAttachmentUploadService } from "@/services/attachment/attachmentUploadService.ts"
import { WorkbenchAttachmentUploadService } from "@/services/attachment/workbenchAttachmentUploadService.ts"
import { ISwitchService, SwitchService } from "@/services/switchService/switchService.ts"
import { ITodoService } from "@/services/todo/todoService.ts"
import { WorkbenchWebLoggerService } from "@/services/weblogger/workbenchWebLoggerService.ts"
import { IWebLoggerService } from "@/services/weblogger/webloggerService.ts"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { InstantiationService, ServiceCollection, SyncDescriptor } from "@hamsterbase/foundation/instantiation"
import { GlobalContext } from "@/ui/components/GlobalContext/GlobalContext.tsx"
import { IWorkbenchOverlayService, WorkbenchOverlayService } from "@/services/overlay/WorkbenchOverlayService.ts"
import { WorkbenchTodoService } from "@/services/todo/workbenchTodoService.ts"
import { App } from "./App.tsx"

const startupStartedAt = performance.now()

async function runStartupStep<T>(name: string, task: () => T | Promise<T>): Promise<T> {
  const startedAt = performance.now()
  try {
    return await task()
  } finally {
    console.info(
      `[startup] ${name}: ${(performance.now() - startedAt).toFixed(1)}ms (${(performance.now() - startupStartedAt).toFixed(1)}ms total)`,
    )
  }
}

function afterFirstPaint(task: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(task)
  })
}

export const startMobile = async () => {
  console.info("[startup] mobile bootstrap started")
  await runStartupStep("load mobile styles", () => import("./styles/main.css"))

  initializeTheme()
  watchThemeChange()
  initKeyboardListeners()
  const serviceCollection = new ServiceCollection()
  serviceCollection.set(IWorkbenchOverlayService, new SyncDescriptor(WorkbenchOverlayService))
  serviceCollection.set(ITodoService, new SyncDescriptor(WorkbenchTodoService))
  serviceCollection.set(IConfigService, new SyncDescriptor(WorkbenchConfig, [new LocalStorageConfigStore()]))
  serviceCollection.set(INavigationService, new SyncDescriptor(NavigationService))
  serviceCollection.set(IWebLoggerService, new SyncDescriptor(WorkbenchWebLoggerService))
  serviceCollection.set(IReminderService, new SyncDescriptor(MobileReminderService))
  serviceCollection.set(ISelfhostedSyncService, new SyncDescriptor(WorkbenchSelfhostedSyncService))
  serviceCollection.set(IAttachmentUploadService, new SyncDescriptor(WorkbenchAttachmentUploadService))
  if (checkPlatform().isTauri) {
    serviceCollection.set(IDatabaseService, new SyncDescriptor(TauriFsDatabaseService))
  } else {
    serviceCollection.set(IDatabaseService, new SyncDescriptor(BrowserDatabaseService))
  }
  serviceCollection.set(ISwitchService, new SyncDescriptor(SwitchService))
  const instantiationService = new InstantiationService(serviceCollection, true)
  await runStartupStep("initialize switches", () =>
    instantiationService.invokeFunction(async (dss) => {
      await dss.get(ISwitchService).init()
    }),
  )
  await runStartupStep("initialize config", () =>
    instantiationService.invokeFunction(async (dss) => {
      await dss.get(IConfigService).init()
    }),
  )
  await runStartupStep("initialize local database and todo model", () =>
    instantiationService.invokeFunction(async (dss) => {
      const databaseService = dss.get(IDatabaseService)
      const todoService = dss.get(ITodoService)
      await databaseService.ensureDatabase(LocalDatabaseMeta)
      await todoService.initStorage(await databaseService.getDatabaseStorage("local"), true)
    }),
  )

  const globalContext = {
    instantiationService,
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <GlobalContext.Provider value={globalContext}>
        <App />
      </GlobalContext.Provider>
    </StrictMode>,
  )
  console.info(`[startup] React render scheduled (${(performance.now() - startupStartedAt).toFixed(1)}ms total)`)

  // Native permission dialogs can be presented before React commits its first
  // frame. Start non-critical integrations only after the UI is visible.
  afterFirstPaint(() => {
    console.info(`[startup] first React frame painted (${(performance.now() - startupStartedAt).toFixed(1)}ms total)`)
    void runStartupStep("initialize self-hosted sync", () =>
      instantiationService.invokeFunction(async (dss) => {
        await dss.get(ISelfhostedSyncService).init()
      }),
    ).catch((error: unknown) => {
      console.error("Error starting self-hosted sync:", error)
    })
    void runStartupStep("initialize reminders", () =>
      instantiationService.invokeFunction(async (dss) => {
        await dss.get(IReminderService).start()
      }),
    ).catch((error: unknown) => {
      console.error("Error starting mobile reminders:", error)
    })
  })
}
