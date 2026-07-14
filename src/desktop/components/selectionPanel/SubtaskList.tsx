import { useDesktopDndSensors } from "@/ui/hooks/useDesktopDndSensors"
import { PlusIcon } from "@/ui/components/icons"
import { TaskList } from "@/ui/components/taskList/taskList.ts"
import { ListOperation } from "@/ui/components/taskList/type"
import { TaskInfo } from "@/core/state/type.ts"
import { desktopStyles } from "@/desktop/theme/main"
import { useService } from "@/ui/hooks/use-service"
import { useWatchEvent } from "@/ui/hooks/use-watch-event"
import { useTodoEntitySubscription } from "@/ui/hooks/useTodoSelector"
import { useRegisterEvent } from "@/ui/hooks/useRegisterEvent"
import { localize } from "@/nls"
import { IListService } from "@/services/list/listService"
import { ITodoService } from "@/services/todo/todoService"
import { closestCenter, DndContext, DragEndEvent } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import type { TreeID } from "loro-crdt"
import React, { useCallback } from "react"
import { flushSync } from "react-dom"
import { DragOverlayItem } from "../drag/DragOverlayItem"
import { SubtaskItem } from "@/desktop/components/todo/SubtaskItem"

interface SubtaskListProps {
  task: TaskInfo
}

export const SubtaskList: React.FC<SubtaskListProps> = ({ task }) => {
  const todoService = useService(ITodoService)
  const listService = useService(IListService)

  useTodoEntitySubscription(task.id)
  useWatchEvent(listService.onSubListChange)

  const sensors = useDesktopDndSensors()

  useRegisterEvent(listService.subList?.onListOperation, (event: ListOperation) => {
    if (event.type === "delete_item") {
      flushSync(() => {
        todoService.deleteItem(event.id)
      })
      if (event.focusItem) {
        listService.subList?.select(event.focusItem, {
          offset: 99999,
          multipleMode: false,
          fireEditEvent: true,
        })
      }
    }
  })

  useRegisterEvent(listService.subList?.onCreateNewOne, (event) => {
    const newTaskId: TreeID = flushSync(() => {
      if (event.afterId) {
        return todoService.addTask({
          title: "",
          position: { type: "afterElement", previousElementId: event.afterId },
        })
      } else {
        return todoService.addTask({
          title: "",
          position: { type: "firstElement", parentId: task.id },
        })
      }
    })
    listService.subList?.select(newTaskId, {
      offset: 0,
      multipleMode: false,
      fireEditEvent: true,
    })
  })

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!task.children) return

      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = task.children.findIndex((item) => item.id === active.id)
      const newIndex = task.children.findIndex((item) => item.id === over.id)

      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return

      let previousTaskId: TreeID | undefined
      if (newIndex === 0) {
        previousTaskId = undefined
      } else if (newIndex > oldIndex) {
        previousTaskId = task.children[newIndex]?.id
      } else {
        previousTaskId = task.children[newIndex - 1]?.id
      }

      const taskId = task.children[oldIndex]?.id
      if (!taskId) return

      if (!previousTaskId) {
        todoService.updateTask(taskId, {
          position: { type: "firstElement", parentId: task.id },
        })
      } else {
        todoService.updateTask(taskId, {
          position: { type: "afterElement", previousElementId: previousTaskId },
        })
      }
    },
    [task.children, task.id, todoService],
  )

  const handleCreateFirstSubtask = useCallback(() => {
    listService.subList?.createNewOne()
  }, [listService.subList])

  if (listService.subList && listService.subList.name === `subtasks-${task.id}`) {
    listService.subList.updateItems(task.children.map((child) => child.id))
  } else {
    listService.setSubList(
      new TaskList(
        `subtasks-${task.id}`,
        task.children.map((child) => child.id),
        [],
        null,
        null,
      ),
    )
  }

  return (
    <div
      className={desktopStyles.SubtaskListSection}
      tabIndex={-1}
      onFocus={() => {
        listService.subList?.setFocus(true)
      }}
      onBlur={() => {
        listService.subList?.setFocus(false)
      }}
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={task.children.map((child) => child.id)} strategy={verticalListSortingStrategy}>
          {task.children.map((subtask) => (
            <SubtaskItem key={subtask.id} subtask={subtask} subList={listService.subList!} />
          ))}
        </SortableContext>
        <DragOverlayItem isSubtask={true} />
      </DndContext>
      <button onClick={handleCreateFirstSubtask} className={desktopStyles.SubtaskListCreateButton}>
        <span className={desktopStyles.SubtaskListCreateButtonIconContainer}>
          <PlusIcon className={desktopStyles.SubtaskListCreateButtonIcon} />
        </span>
        <span className={desktopStyles.SubtaskListCreateButtonLabel}>
          {localize("tasks.add_subtask", "Add subtask")}
        </span>
      </button>
    </div>
  )
}
