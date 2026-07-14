import { taskDisplaySettingOptions } from "@/core/common/TaskDisplaySettings"
import { getTimeAfter } from "@/core/time/getTimeAfter"
import {
  completedTasksRangeConfigKey,
  showCompletedTasksConfigKey,
  showFutureTasksConfigKey,
} from "@/services/config/config"
import { useConfig } from "./useConfig"
import { useState } from "react"

export const useGlobalTaskDisplaySettings = () => {
  const [now] = useState(Date.now)
  const { value: showFutureTasks, setValue: setShowFutureTasks } = useConfig(showFutureTasksConfigKey("global"))
  const { value: showCompletedTasks, setValue: setShowCompletedTasks } = useConfig(
    showCompletedTasksConfigKey("global"),
  )
  const { value: completedTasksRange, setValue: setCompletedTasksRange } = useConfig(
    completedTasksRangeConfigKey("global"),
  )

  return {
    showFutureTasks,
    showCompletedTasks,
    completedTasksRange,
    completedAfter: getTimeAfter(now, completedTasksRange),
    setShowFutureTasks,
    setShowCompletedTasks,
    setCompletedTasksRange,
    settingOptions: taskDisplaySettingOptions,
  }
}
