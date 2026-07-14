import { getTimeAfter } from "@/core/time/getTimeAfter"
import { useService } from "@/ui/hooks/use-service"
import { useConfig } from "@/ui/hooks/useConfig"
import { useGlobalTaskDisplaySettings } from "@/ui/hooks/useGlobalTaskDisplaySettings"
import { TaskDisplaySettingsController } from "@/mobile/overlay/taskDisplaySettings/TaskDisplaySettingsController"
import {
  completedTasksRangeConfigKey,
  showCompletedTasksConfigKey,
  showFutureTasksConfigKey,
} from "@/services/config/config"
import { IInstantiationService } from "@hamsterbase/foundation/instantiation"
import { useState } from "react"

interface useTaskDisplaySettingsOption {
  hideShowFutureTasks?: boolean
}

export const useTaskDisplaySettingsMobile = (page: string, option?: useTaskDisplaySettingsOption) => {
  const instantiationService = useService(IInstantiationService)
  const [now] = useState(Date.now)
  const globalSettings = useGlobalTaskDisplaySettings()
  const { value: showFutureTasks, setValue: setShowFutureTasks } = useConfig(
    showFutureTasksConfigKey(page, globalSettings.showFutureTasks),
  )
  const { value: showCompletedTasks, setValue: setShowCompletedTasks } = useConfig(
    showCompletedTasksConfigKey(page, globalSettings.showCompletedTasks),
  )
  const { value: completedTasksRange, setValue: setCompletedTasksRange } = useConfig(
    completedTasksRangeConfigKey(page, globalSettings.completedTasksRange),
  )

  function openTaskDisplaySettings() {
    TaskDisplaySettingsController.create(
      {
        showFutureTasks,
        showCompletedTasks,
        completedTasksRange,
        hideShowFutureTasks: option?.hideShowFutureTasks,
        onChange: (value) => {
          setShowFutureTasks(value.showFutureTasks)
          setShowCompletedTasks(value.showCompletedTasks)
          setCompletedTasksRange(value.completedTasksRange)
        },
      },
      instantiationService,
    )
  }

  return {
    showFutureTasks,
    showCompletedTasks,
    completedAfter: getTimeAfter(now, completedTasksRange),
    openTaskDisplaySettings,
  }
}
