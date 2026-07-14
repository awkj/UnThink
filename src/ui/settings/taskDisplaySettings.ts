import { localize } from "@/nls"

export const taskDisplaySettingOptions = {
  get title() {
    return localize("settings.displaySettings", "Task Display")
  },
  get description() {
    return localize(
      "settings.displaySettings.description",
      "Control which tasks are visible across all views (Today, Projects, Areas). These settings apply everywhere unless overridden in specific views.",
    )
  },
  showFutureTasks: {
    get title() {
      return localize("settings.showFutureTasks", "Show Future Tasks")
    },
    get description() {
      return localize("settings.showFutureTasks.description", "Display tasks with future due dates in all views.")
    },
  },
  showCompletedTasks: {
    get title() {
      return localize("settings.showCompletedTasks", "Show Completed Tasks")
    },
    get description() {
      return localize("settings.showCompletedTasks.description", "Display finished tasks in all views.")
    },
  },
  completedTasksRange: {
    get title() {
      return localize("settings.completedTasksRange", "Completed Tasks Range")
    },
    get description() {
      return localize(
        "settings.completedTasksRange.description",
        "How long to keep completed tasks visible across all views.",
      )
    },
    get options() {
      return [
        {
          value: "today",
          description: localize(
            "settings.completedTasksRange.today.description",
            "Show tasks completed since start of today",
          ),
          label: localize("settings.completedTasksRange.today", "Today"),
        },
        {
          value: "day",
          description: localize(
            "settings.completedTasksRange.day.description",
            "Show tasks completed since start of yesterday",
          ),
          label: localize("settings.completedTasksRange.day", "Last 24 hours"),
        },
        {
          value: "week",
          description: localize(
            "settings.completedTasksRange.week.description",
            "Show tasks completed since start of last week",
          ),
          label: localize("settings.completedTasksRange.week", "Last week"),
        },
        {
          value: "month",
          description: localize(
            "settings.completedTasksRange.month.description",
            "Show tasks completed since start of last month",
          ),
          label: localize("settings.completedTasksRange.month", "Last month"),
        },
        {
          value: "all",
          description: localize("settings.completedTasksRange.all.description", "Show all completed tasks"),
          label: localize("settings.completedTasksRange.all", "All time"),
        },
      ] as const
    },
  },
} as const
