import type { ITaskModelData, TaskObjectSchema } from "@/core/type"
import { ITodoService } from "@/services/todo/todoService"
import { useCallback } from "react"
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector"
import { useService } from "./use-service"

export function useTodoSelector<T>(
  selector: (state: ITaskModelData) => T,
  isEqual: (left: T, right: T) => boolean = Object.is,
): T {
  const todoService = useService(ITodoService)
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const disposable = todoService.onStateChange(onStoreChange)
      return () => disposable.dispose()
    },
    [todoService],
  )
  const getSnapshot = useCallback(() => todoService.modelState, [todoService])
  return useSyncExternalStoreWithSelector(subscribe, getSnapshot, getSnapshot, selector, isEqual)
}

function collectEntityFamily(state: ITaskModelData, id: string, result: TaskObjectSchema[]): void {
  const entity = state.taskObjectMap.get(id)
  if (!entity) return
  result.push(entity)
  for (const childId of entity.children) {
    collectEntityFamily(state, childId, result)
  }
}

/** Subscribe only to an entity, its descendants, and its reminders. */
export function useTodoEntitySubscription(id: string | undefined): void {
  useTodoSelector((state) => {
    if (!id) return ""
    const family: TaskObjectSchema[] = []
    collectEntityFamily(state, id, family)
    return JSON.stringify([family, family.map((entity) => state.remindersMap.get(entity.id) ?? [])])
  })
}

export function useTodoLocationSubscription(id: string): void {
  useTodoSelector((state) => {
    const entity = state.taskObjectMap.get(id)
    const parent = entity && "parentId" in entity && entity.parentId ? state.taskObjectMap.get(entity.parentId) : null
    return JSON.stringify([entity, parent])
  })
}

export function useTodoViewSubscription(uid: string): void {
  useTodoSelector((state) => JSON.stringify(state.views.find((view) => view.uid === uid)))
}
