import { checkPlatform } from "@/ui/browser/checkPlatform"
import { initializeTheme, watchThemeChange } from "@/ui/browser/initializeTheme"
import { initKeyboardListeners } from "@/ui/browser/initKeyboardListeners"
import "@/services/command/commands/desktop"
import "@/desktop/overlay/commandPalette/commands"
import { GlobalContext } from "@/ui/components/GlobalContext/GlobalContext"
import { StandaloneCommandService } from "@/services/command/standaloneCommandService"
import { LocalStorageConfigStore } from "@/services/config/localStorageConfigStore"
import { IConfigService, WorkbenchConfig } from "@/services/config/configService"
import { OpfsDatabaseService } from "@/services/database/opfsDatabaseService"
import { IDatabaseService, LocalDatabaseMeta } from "@/services/database/database"
import { TauriFsDatabaseService } from "@/services/database/tauriFsDatabaseService"
import { EditService, IEditService } from "@/services/edit/editService"
import { IWorkbenchInstanceService, WorkbenchInstanceService } from "@/services/instance/instanceService"
import { StandaloneKeybindingService } from "@/services/keybinding/standaloneKeybindingService"
import { IListService, ListService } from "@/services/list/listService"
import { IMenuService } from "@/services/menu/menuService"
import { NoopMenuService } from "@/services/menu/noopMenuService"
import { INavigationService, NavigationService } from "@/services/navigationService/navigationService"
import { IWorkbenchOverlayService, WorkbenchOverlayService } from "@/services/overlay/WorkbenchOverlayService"
import { IReminderService } from "@/services/reminders/reminderService"
import { DesktopReminderService } from "@/services/reminders/desktopReminderService"
import { IDockBadgeService } from "@/services/dockBadge/dockBadgeService"
import { TauriDockBadgeService } from "@/services/dockBadge/tauriDockBadgeService"
import { ISelfhostedSyncService } from "@/services/selfhostedSync/selfhostedSyncService"
import { WorkbenchSelfhostedSyncService } from "@/services/selfhostedSync/workbenchSelfhostedSyncService"
import { IAIService } from "@/services/ai/aiService"
import { WorkbenchAIService } from "@/services/ai/workbenchAIService"
import { IAttachmentUploadService } from "@/services/attachment/attachmentUploadService"
import { WorkbenchAttachmentUploadService } from "@/services/attachment/workbenchAttachmentUploadService"
import { ISwitchService, SwitchService } from "@/services/switchService/switchService"
import "@/services/todo/desktopCommands"
import { WorkbenchTodoService } from "@/services/todo/workbenchTodoService"
import { ITodoService } from "@/services/todo/todoService"
import { WorkbenchWebLoggerService } from "@/services/weblogger/workbenchWebLoggerService"
import { IWebLoggerService } from "@/services/weblogger/webloggerService"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, HashRouter } from "react-router"
import { ICommandService } from "@hamsterbase/foundation/commands"
import { ContextKeyService } from "@hamsterbase/foundation/contextkey"
import { IContextKeyService } from "@hamsterbase/foundation/contextkey"
import { InstantiationService, ServiceCollection, SyncDescriptor } from "@hamsterbase/foundation/instantiation"
import { IKeybindingService } from "@hamsterbase/foundation/keybinding"
import { App } from "./app"

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

export async function startDesktop() {
  console.info("[startup] desktop bootstrap started")
  await runStartupStep("load desktop styles", () =>
    Promise.all([import("allotment/dist/style.css"), import("./styles/main.css")]),
  )

  initializeTheme()
  watchThemeChange()
  initKeyboardListeners()
  const { isTauri } = checkPlatform()

  const serviceCollection = new ServiceCollection()
  serviceCollection.set(IWorkbenchOverlayService, new SyncDescriptor(WorkbenchOverlayService))
  serviceCollection.set(ITodoService, new SyncDescriptor(WorkbenchTodoService))
  serviceCollection.set(IConfigService, new SyncDescriptor(WorkbenchConfig, [new LocalStorageConfigStore()]))
  serviceCollection.set(INavigationService, new SyncDescriptor(NavigationService))
  if (isTauri) {
    serviceCollection.set(IDatabaseService, new SyncDescriptor(TauriFsDatabaseService))
  } else {
    serviceCollection.set(IDatabaseService, new SyncDescriptor(OpfsDatabaseService))
  }
  serviceCollection.set(ISwitchService, new SyncDescriptor(SwitchService))
  serviceCollection.set(IContextKeyService, new SyncDescriptor(ContextKeyService))
  serviceCollection.set(ICommandService, new SyncDescriptor(StandaloneCommandService))
  serviceCollection.set(IKeybindingService, new SyncDescriptor(StandaloneKeybindingService, [document.body]))
  serviceCollection.set(IListService, new SyncDescriptor(ListService))
  serviceCollection.set(IEditService, new SyncDescriptor(EditService))
  serviceCollection.set(IWorkbenchInstanceService, new SyncDescriptor(WorkbenchInstanceService))
  serviceCollection.set(IWebLoggerService, new SyncDescriptor(WorkbenchWebLoggerService))
  serviceCollection.set(IReminderService, new SyncDescriptor(DesktopReminderService))
  serviceCollection.set(ISelfhostedSyncService, new SyncDescriptor(WorkbenchSelfhostedSyncService))
  serviceCollection.set(IMenuService, new SyncDescriptor(NoopMenuService))
  serviceCollection.set(IDockBadgeService, new SyncDescriptor(TauriDockBadgeService))
  serviceCollection.set(IAIService, new SyncDescriptor(WorkbenchAIService))
  serviceCollection.set(IAttachmentUploadService, new SyncDescriptor(WorkbenchAttachmentUploadService))
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

  instantiationService.invokeFunction(async (dss) => {
    const keybindings = dss.get(IKeybindingService).getKeybindings()
    console.log(`Found ${keybindings.length} keybindings`)
  })

  const globalContext = {
    instantiationService,
  }

  const Router = isTauri ? HashRouter : BrowserRouter

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <GlobalContext.Provider value={globalContext}>
        <Router>
          <App></App>
        </Router>
      </GlobalContext.Provider>
    </StrictMode>,
  )
  console.info(`[startup] React render scheduled (${(performance.now() - startupStartedAt).toFixed(1)}ms total)`)

  // These integrations are not needed to render the application shell. Start
  // them after the first frame so native IPC or network setup cannot hold the
  // loading screen in front of the user.
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
      console.error("Error starting desktop reminders:", error)
    })
    void runStartupStep("initialize dock badge", () =>
      instantiationService.invokeFunction(async (dss) => {
        await dss.get(IDockBadgeService).start()
      }),
    ).catch((error: unknown) => {
      console.error("Error starting dock badge:", error)
    })
  })
}
