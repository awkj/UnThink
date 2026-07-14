import type { TreeID } from "loro-crdt"
import { ITaskModelData, ItemStatus, ReminderWithId, RecurringRule } from "../type.ts"
export type { ITaskModelData }

export interface ProjectInfoState {
  type: "project"
  id: TreeID
  uid: string
  notes?: string | undefined
  title: string
  tags: string[]
  startDate?: number | undefined
  dueDate?: number | undefined
  status: ItemStatus
  completionAt?: number | undefined
  progress: number
  projectHeadings: ProjectHeadingInfo[]
  tasks: TaskInfo[]
  totalTasks: number
  completedTasks: number
  areaTitle?: string | undefined
}

export interface AreaInfoState {
  id: TreeID
  uid: string
  title: string
  tags: string[]
  projectList: ProjectInfoState[]
}

export interface AreaDetailState {
  id: TreeID
  uid: string
  title: string
  tags: string[]
  projectList: ProjectInfoState[]
  taskList: TaskInfo[]
}

export interface SubTaskInfo {
  id: TreeID
  title: string
  status: ItemStatus
}

export interface TaskInfo {
  type: "task"
  id: TreeID
  uid: string
  title: string
  notes?: string | undefined
  startDate?: number | undefined
  dueDate?: number | undefined
  tags: string[]
  status: ItemStatus
  children: SubTaskInfo[]
  parentId?: string | undefined
  isParentArchived?: boolean | undefined
  isSubTask: boolean
  projectTitle: string
  completionAt?: number | undefined
  reminders: ReminderWithId[]
  recurringRule?: RecurringRule | undefined
}

export interface ProjectHeadingInfo {
  id: TreeID
  parentId: TreeID
  title: string
  tasks: TaskInfo[]
  isArchived: boolean
  archivedDate?: number | null | undefined
}

export function isTask(modelData: ITaskModelData, id: TreeID) {
  return modelData.taskObjectMap.get(id)?.type === "task"
}

export function isProject(modelData: ITaskModelData, id: TreeID) {
  return modelData.taskObjectMap.get(id)?.type === "project"
}
