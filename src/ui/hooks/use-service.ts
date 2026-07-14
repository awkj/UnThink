import { IWorkbenchInstance, IWorkbenchInstanceService } from "@/services/instance/instanceService"
import { useContext, useEffect, useMemo } from "react"
import { ServiceIdentifier } from "@hamsterbase/foundation/instantiation"
import { GlobalContext } from "../components/GlobalContext/GlobalContext"

export function useService<T>(id: ServiceIdentifier<T>): T {
  const ctx = useContext(GlobalContext)!
  const service = ctx.instantiationService.invokeFunction((o) => o.get(id))
  return service
}

export const useWorkbenchInstance = <T extends IWorkbenchInstance>(key: string, creator: unknown): T => {
  const instanceService = useService(IWorkbenchInstanceService)
  const instance = useMemo(() => instanceService.initializeInstance<T>(key, creator), [creator, instanceService, key])

  useEffect(() => {
    return () => {
      instanceService.unmountInstance(key)
    }
  }, [key, instanceService])

  return instance
}
