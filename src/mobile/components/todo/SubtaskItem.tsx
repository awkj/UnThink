import { handleFocusAndScroll } from "@/ui/browser/commonFocusHandler"
import { DragHandleIcon } from "@/ui/components/icons"
import { ItemStatus } from "@/core/type.ts"
import { useLongPress } from "@/ui/hooks/useLongPress"
import { TaskCheckbox } from "@/mobile/components/icon/TaskCheckbox"
import { localize } from "@/nls"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import classNames from "classnames"
import React from "react"
import { styles } from "@/mobile/theme"
import { useSyncedState } from "@/ui/hooks/useSyncedState"

interface SubtaskItemProps {
  id: string
  title: string
  status: ItemStatus
  onStatusChange: (id: string, status: ItemStatus) => void
  onTitleChange: (id: string, title: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  inputRef?: (el: HTMLInputElement | null) => void
  className?: string
  disableDragStyle?: boolean
  inputTestId?: string
  inputDataId?: string
  statusButtonClassName?: string
  inputClassName?: string
  dragHandleClassName?: string
}

export const SubtaskItem: React.FC<SubtaskItemProps> = ({
  id,
  title,
  status,
  onStatusChange,
  onTitleChange,
  onCreate,
  onDelete,
  inputRef,
  className,
  disableDragStyle = false,
  inputTestId,
  inputDataId,
  statusButtonClassName,
  inputClassName,
  dragHandleClassName,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleClick = () => {
    onStatusChange(id, status === "created" ? "completed" : "created")
  }

  const { longPressEvents } = useLongPress(() => {
    if (status === "canceled") {
      onStatusChange(id, "created")
    } else {
      onStatusChange(id, "canceled")
    }
  })

  const [inputValue, setInputValue] = useSyncedState(title)

  const handleBlur = () => {
    if (inputValue !== title) {
      onTitleChange(id, inputValue)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      onCreate()
    }
    if (e.key === "Backspace" && inputValue === "") {
      onDelete(id)
      e.preventDefault()
    }
  }

  if (isDragging && !disableDragStyle) {
    return <div className={styles.subtaskItemDraggingPlaceholder} ref={setNodeRef} style={style}></div>
  }

  return (
    <div className={classNames(styles.subtaskItemRoot, className)} ref={setNodeRef} style={style}>
      <div
        onClick={handleClick}
        {...longPressEvents}
        className={classNames(styles.subtaskItemStatusButton, statusButtonClassName)}
      >
        <TaskCheckbox size="small" status={status} />
      </div>
      <input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onFocus={handleFocusAndScroll}
        className={classNames(
          styles.createTaskSubtaskInput,
          inputClassName,
          status === "canceled"
            ? styles.subtaskItemInputCanceled
            : status === "completed"
              ? styles.subtaskItemInputCompleted
              : styles.subtaskItemInputNormal,
        )}
        placeholder={localize("mobile.subtask.placeholder", "Subtask")}
        ref={inputRef}
        data-testid={inputTestId}
        data-edit-subtask-id={inputDataId}
      />
      <DragHandleIcon
        className={classNames(styles.createTaskSubtaskDragHandle, dragHandleClassName)}
        strokeWidth={1.5}
        {...attributes}
        {...listeners}
      />
    </div>
  )
}
