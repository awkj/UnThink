import { useCallback, useRef, useSyncExternalStore } from "react"
import { Event } from "@hamsterbase/foundation/event"

export function useWatchEvent<T = unknown>(event: Event<T> | undefined, shouldRender?: (e: T) => boolean) {
  const revision = useRef(0)
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!event) return () => undefined
      const disposable = event((eventValue) => {
        if (!shouldRender || shouldRender(eventValue)) {
          revision.current += 1
          onStoreChange()
        }
      })
      return () => disposable.dispose()
    },
    [event, shouldRender],
  )
  const getSnapshot = useCallback(() => revision.current, [])
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
