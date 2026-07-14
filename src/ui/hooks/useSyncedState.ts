import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react"

type Equality<T> = (left: T, right: T) => boolean

/**
 * Local draft state that follows an external value until the user edits it.
 * Keeping this synchronization in one hook makes the exceptional effect-based
 * state transition explicit and prevents every controlled editor duplicating it.
 */
export function useSyncedState<T>(externalValue: T, equals: Equality<T> = Object.is): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(externalValue)
  useEffect(() => {
    // This hook exists specifically to synchronize an editable local draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue((current) => (equals(current, externalValue) ? current : externalValue))
  }, [equals, externalValue])
  return [value, setValue]
}

export function useSynchronizeState<T>(
  setValue: Dispatch<SetStateAction<T>>,
  externalValue: T,
  equals: Equality<T> = Object.is,
): void {
  useEffect(() => {
    // This hook exists specifically to synchronize state produced by a
    // two-pass query (the selected filter is an input to the same query).
    setValue((current) => (equals(current, externalValue) ? current : externalValue))
  }, [equals, externalValue, setValue])
}

export function useResettableState<T>(resetKey: string | number | null, createValue: () => T) {
  const [state, setState] = useState(() => ({ resetKey, value: createValue() }))
  const value = state.resetKey === resetKey ? state.value : createValue()
  const setValue = useCallback(
    (next: SetStateAction<T>) => {
      setState({
        resetKey,
        value: typeof next === "function" ? (next as (current: T) => T)(value) : next,
      })
    },
    [resetKey, value],
  )
  return [value, setValue] as const
}
