import { getAreaDetail } from "@/core/state/getArea"
import { AreaDetailState } from "@/core/state/type"
import { useService } from "@/ui/hooks/use-service"
import { ITodoService } from "@/services/todo/todoService"
import { TreeID } from "loro-crdt"
import { useTodoEntitySubscription } from "./useTodoSelector"

export const useAreaDetail = (areaId?: TreeID) => {
  const todoService = useService(ITodoService)
  useTodoEntitySubscription(areaId)

  let areaDetail: AreaDetailState | null = null
  try {
    if (areaId) {
      areaDetail = getAreaDetail(todoService.modelState, areaId)
    }
  } catch (error) {
    console.error(error)
  }

  return {
    areaDetail,
  }
}
