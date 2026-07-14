import { lazy, type ComponentType } from "react"

function lazyNamed<T extends Record<K, ComponentType>, K extends keyof T>(loader: () => Promise<T>, name: K) {
  return lazy(async () => ({ default: (await loader())[name] }))
}

const MobileHome = lazyNamed(() => import("./pages/home.tsx"), "MobileHome")
const TodayPage = lazyNamed(() => import("./pages/today.tsx"), "TodayPage")
const InboxPage = lazyNamed(() => import("./pages/inbox.tsx"), "InboxPage")
const ProjectPage = lazyNamed(() => import("./pages/project.tsx"), "ProjectPage")
const AreaPage = lazyNamed(() => import("./pages/area.tsx"), "AreaPage")
const MobileSettings = lazyNamed(() => import("./pages/settings"), "MobileSettings")
const ScheduledPage = lazyNamed(() => import("@/mobile/pages/scheduled.tsx"), "ScheduledPage")
const FutureProjectsPage = lazyNamed(() => import("./pages/futureProjectsPage.tsx"), "FutureProjectsPage")
const CreateTaskActionSheet = lazyNamed(() => import("./pages/createTask.tsx"), "CreateTaskActionSheet")
const LanguageSettings = lazyNamed(() => import("./pages/settings/languageSettings"), "LanguageSettings")
const ThemeSettings = lazyNamed(() => import("@/mobile/pages/settings/themeSettings.tsx"), "ThemeSettings")
const CalendarSettings = lazyNamed(() => import("@/mobile/pages/settings/calendarSettings.tsx"), "CalendarSettings")
const TaskDisplaySettings = lazyNamed(
  () => import("@/mobile/pages/settings/taskDisplaySettings.tsx"),
  "TaskDisplaySettings",
)
const ExportSettings = lazyNamed(() => import("@/mobile/pages/settings/exportSettings.tsx"), "ExportSettings")
const MobileCompleted = lazyNamed(() => import("@/mobile/pages/completed.tsx"), "MobileCompleted")
const ImportPage = lazyNamed(() => import("@/mobile/pages/settings/import.tsx"), "ImportPage")
const AboutPage = lazyNamed(() => import("@/mobile/pages/settings/about.tsx"), "AboutPage")
const FeedbackPage = lazyNamed(() => import("@/mobile/pages/settings/feedback.tsx"), "FeedbackPage")
const SelfhostedSync = lazyNamed(() => import("./pages/settings/selfhosted-sync/selfhostedSync.tsx"), "SelfhostedSync")
const ViewPage = lazyNamed(() => import("./pages/view.tsx"), "ViewPage")

interface IPage {
  url: string
  component: ComponentType
}

export const pages: IPage[] = [
  {
    url: "/home",
    component: MobileHome,
  },
  {
    url: "/today",
    component: TodayPage,
  },
  {
    url: "/inbox",
    component: InboxPage,
  },
  {
    url: "/project/:projectUid",
    component: ProjectPage,
  },
  {
    url: "/area/:areaUID",
    component: AreaPage,
  },
  {
    url: "/settings",
    component: MobileSettings,
  },
  {
    url: "/settings/language",
    component: LanguageSettings,
  },
  {
    url: "/settings/theme",
    component: ThemeSettings,
  },
  {
    url: "/settings/calendar",
    component: CalendarSettings,
  },
  {
    url: "/settings/task-display",
    component: TaskDisplaySettings,
  },
  {
    url: "/settings/export",
    component: ExportSettings,
  },
  {
    url: "/settings/import",
    component: ImportPage,
  },
  {
    url: "/settings/feedback",
    component: FeedbackPage,
  },
  {
    url: "/completed",
    component: MobileCompleted,
  },
  {
    url: "/scheduled",
    component: ScheduledPage,
  },
  {
    url: "/future_projects",
    component: FutureProjectsPage,
  },
  {
    url: "/create_task",
    component: CreateTaskActionSheet,
  },
  {
    url: "/settings/about",
    component: AboutPage,
  },
  {
    url: "/settings/selfhosted-sync",
    component: SelfhostedSync,
  },
  {
    url: "/views/:viewUid",
    component: ViewPage,
  },
]
