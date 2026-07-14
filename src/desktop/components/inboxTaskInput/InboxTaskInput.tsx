import { PlusIcon } from "@/ui/components/icons"
import { desktopStyles } from "@/desktop/theme/main"
import { useWorkbenchInstance } from "@/ui/hooks/use-service"
import { useWatchEvent } from "@/ui/hooks/use-watch-event"
import { localize } from "@/nls"
import React, { useCallback } from "react"
import { INBOX_TASK_INPUT_CONTROLLER_KEY, InboxTaskInputController } from "./InboxTaskInputController"

export const InboxTaskInput: React.FC = () => {
  const controller = useWorkbenchInstance<InboxTaskInputController>(
    INBOX_TASK_INPUT_CONTROLLER_KEY,
    InboxTaskInputController,
  )

  useWatchEvent(controller.onInputValueChange)

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      controller?.updateInputValue(e.target.value)
    },
    [controller],
  )

  const handleCreateTask = useCallback(() => {
    controller.createTask()
  }, [controller])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter" || event.nativeEvent.isComposing) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      handleCreateTask()
    },
    [handleCreateTask],
  )

  return (
    <div className={desktopStyles.InboxTaskInputWrapper}>
      <div className={desktopStyles.InboxTaskInputContainer}>
        <button
          type="button"
          onClick={handleCreateTask}
          aria-label={localize("addTask", "Add Task")}
          className={desktopStyles.InboxTaskInputButton}
        >
          <PlusIcon className={desktopStyles.InboxTaskInputIcon} />
        </button>
        <input
          type="text"
          value={controller.inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={localize("addTask", "Add Task")}
          className={desktopStyles.InboxTaskInputField}
        />
      </div>
    </div>
  )
}
