import { getPeerId, resetPeerId } from "@/ui/browser/getPeerId"
import { TaskModel } from "@/core/model.ts"
import { batchEdit as executeBatchEdit, BatchEditParams, BatchEditResult } from "@/core/state/tasks/batchEdit/batchEdit"
import { createProjectWithChildren } from "@/core/state/tasks/createProject/createProjectWithChildren"
import { CreateProjectWithChildrenParams } from "@/core/state/tasks/createProject/types"
import { ITaskModelData } from "@/core/type"
import {
  AttachmentSchema,
  CreateAreaSchema,
  CreateAttachmentSchema,
  CreateProjectHeadingSchema,
  CreateProjectSchema,
  CreateReminderSchema,
  CreateTaskSchema,
  CreateTaskViewSchema,
  ItemMovePosition,
  ProjectStatusTransition,
  ReminderWithId,
  UpdateAreaSchema,
  UpdateProjectHeadingSchema,
  UpdateProjectSchema,
  UpdateReminderSchema,
  UpdateTaskSchema,
  UpdateTaskViewSchema,
} from "@/core/type.ts"
import { IDatabaseStorage } from "@/services/database/database"
import { EditingContent, ITodoService, TaskCommand, VIEW_SCHEMA_VERSION } from "@/services/todo/todoService.ts"
import type { TreeID } from "loro-crdt"
import { debounceTime, Subject } from "rxjs"
import { ByteBuffer, decodeBase64, encodeBase64 } from "@hamsterbase/foundation/buffer"
import { Emitter } from "@hamsterbase/foundation/event"
import { DisposableStore } from "@hamsterbase/foundation/lifecycle"

interface DateModel {
  taskModel: TaskModel
  modelData: ITaskModelData
  dispose: () => void
  persist: (updates: Uint8Array[]) => Promise<void>
  compact: () => Promise<void>
}

const COMPACT_AFTER_UPDATES = 128

class PersistenceQueue {
  private pending: Promise<void> = Promise.resolve()

  run(task: () => Promise<void>): Promise<void> {
    const result = this.pending.then(task)
    this.pending = result.catch(() => undefined)
    return result
  }
}

export class WorkbenchTodoService implements ITodoService {
  readonly _serviceBrand: undefined
  private dataModel: DateModel | null = null
  private _onStateChange: Emitter<void> = new Emitter()
  public onStateChange = this._onStateChange.event

  private _onEditingContentChange: Emitter<TreeID> = new Emitter()
  public onEditingContentChange = this._onEditingContentChange.event

  private _editingContent: EditingContent | null = null

  private _keepAliveElements: string[] = []
  private _clearKeepAliveSubject = new Subject<void>()

  private _storageId: string | null = null

  constructor() {
    this._clearKeepAliveSubject.pipe(debounceTime(1000)).subscribe(() => {
      this._keepAliveElements = []
      this._onStateChange.fire()
    })
  }

  get editingContent() {
    return this._editingContent
  }

  get storageId() {
    if (!this._storageId) {
      throw new Error("storageId is not initialized")
    }
    return this._storageId
  }

  public async initStorage(storage: IDatabaseStorage, keepPeerId?: boolean): Promise<void> {
    this._storageId = storage.id
    const taskModel = new TaskModel()
    if (!keepPeerId) {
      await resetPeerId()
    }
    const peerId = await getPeerId()
    taskModel.setPeerId(peerId)
    const queue = new PersistenceQueue()
    const previousKeys = await storage.list()
    if (previousKeys.length > 0) {
      const data = (await Promise.all(previousKeys.map((key) => storage.read(key)))).filter(Boolean)
      taskModel.import(data.map((item) => decodeBase64(item).buffer))
    }

    let persistedUpdates = previousKeys.length
    const compact = () =>
      queue.run(async () => {
        const keys = await storage.list()
        const snapshotKey = await storage.save(encodeBase64(ByteBuffer.wrap(taskModel.export())))
        await Promise.all(keys.filter((key) => key !== snapshotKey).map((key) => storage.delete(key)))
        persistedUpdates = 1
      })
    const persist = (updates: Uint8Array[]) =>
      queue.run(async () => {
        for (const update of updates) {
          await storage.save(encodeBase64(ByteBuffer.wrap(update)))
          persistedUpdates += 1
        }
        if (persistedUpdates >= COMPACT_AFTER_UPDATES) {
          const keys = await storage.list()
          const snapshotKey = await storage.save(encodeBase64(ByteBuffer.wrap(taskModel.export())))
          await Promise.all(keys.filter((key) => key !== snapshotKey).map((key) => storage.delete(key)))
          persistedUpdates = 1
        }
      })
    const disposeStore = new DisposableStore()
    await compact()
    taskModel.clearUndoHistory()
    const dataModel: DateModel = {
      taskModel,
      persist,
      compact,
      modelData: taskModel.toJSON(),
      dispose: () => {
        disposeStore.dispose()
      },
    }
    disposeStore.add(
      taskModel.onLocalUpdate((update) => {
        void persist([update]).catch((error: unknown) => {
          console.error("Failed to persist local task update:", error)
        })
        dataModel.modelData = taskModel.toJSON()
        this._onStateChange.fire()
      }),
    )
    if (this.dataModel) {
      this.dataModel.dispose()
    }
    this.dataModel = dataModel
    this._onStateChange.fire()
  }

  private get taskModel() {
    if (!this.dataModel) {
      throw new Error("dataModel is not initialized")
    }
    return this.dataModel.taskModel
  }

  get keepAliveElements() {
    if (this.editingContent) {
      return [this.editingContent.id, ...this._keepAliveElements]
    }
    return this._keepAliveElements
  }

  get modelState() {
    if (!this.dataModel) {
      throw new Error("dataModel is not initialized")
    }
    return this.dataModel.modelData
  }

  public async import(data: Array<Uint8Array>, databaseId: string) {
    if (this.storageId !== databaseId) {
      throw new Error("storageId is not initialized")
    }
    if (!this.dataModel) {
      throw new Error("dataModel is not initialized")
    }
    const previousVersion = this.dataModel.taskModel.version
    this.dataModel.taskModel.import(data)
    this.dataModel.modelData = this.dataModel.taskModel.toJSON()
    await this.dataModel.persist(data)
    if (previousVersion.compare(this.dataModel.taskModel.version) !== 0) {
      this._onStateChange.fire()
    }
  }

  public exportPatch(from: Record<string, number>, databaseId: string) {
    if (this.storageId !== databaseId) {
      throw new Error("storageId is not initialized")
    }
    return this.taskModel.exportPatch(from)
  }

  getModelVersion(databaseId: string): Record<string, number> {
    if (this.storageId !== databaseId) {
      throw new Error("storageId is not initialized")
    }
    return this.modelState.version
  }

  moveDateAssignedList(item: TreeID, position: ItemMovePosition) {
    return this.taskModel.moveDateAssignedList(item, position)
  }

  endEditingContent() {
    if (this._editingContent) {
      this.addKeepAliveElement(this._editingContent.id)
      this._onEditingContentChange.fire(this._editingContent.id)
    }
    this._editingContent = null
    this._onStateChange.fire()
  }

  addArea(area: CreateAreaSchema): TreeID {
    return this.taskModel.addArea(area)
  }

  addProject(project: CreateProjectSchema): TreeID {
    return this.taskModel.addProject(project)
  }

  addProjectHeading(projectHeading: CreateProjectHeadingSchema): TreeID {
    return this.taskModel.addProjectHeading(projectHeading)
  }
  addTask(task: CreateTaskSchema): TreeID {
    return this.taskModel.addTask(task)
  }

  updateArea(areaId: TreeID, payload: UpdateAreaSchema) {
    return this.taskModel.updateArea(areaId, payload)
  }
  updateProjectHeading(projectHeadingId: TreeID, payload: UpdateProjectHeadingSchema) {
    return this.taskModel.updateProjectHeading(projectHeadingId, payload)
  }

  updateTask(taskId: TreeID, payload: UpdateTaskSchema) {
    this.addKeepAliveElement(taskId)
    return this.taskModel.updateTask(taskId, payload)
  }

  deleteItem(itemId: TreeID) {
    return this.taskModel.deleteItem(itemId)
  }

  updateProject(projectId: TreeID, payload: UpdateProjectSchema) {
    return this.taskModel.updateProject(projectId, payload)
  }
  covertToProject(itemId: TreeID) {
    return this.taskModel.covertToProject(itemId)
  }

  transitionProjectState(options: ProjectStatusTransition) {
    return this.taskModel.transitionProjectState(options)
  }

  private addKeepAliveElement(element: string) {
    this._clearKeepAliveSubject.next()
    this._keepAliveElements.push(element)
    this._onStateChange.fire()
  }

  editItem(itemId: TreeID) {
    this._editingContent = {
      id: itemId,
    }
    this._onEditingContentChange.fire(itemId)
  }

  addReminder(data: CreateReminderSchema): string {
    return this.taskModel.addReminder(data)
  }

  updateReminder(reminderId: string, data: UpdateReminderSchema): void {
    return this.taskModel.updateReminder(reminderId, data)
  }

  deleteReminder(reminderId: string): void {
    return this.taskModel.deleteReminder(reminderId)
  }

  getReminders(): Map<TreeID, ReminderWithId[]> {
    return this.taskModel.getReminders()
  }

  addAttachment(data: CreateAttachmentSchema): void {
    return this.taskModel.addAttachment(data)
  }

  softDeleteAttachment(attachmentId: string): void {
    return this.taskModel.softDeleteAttachment(attachmentId)
  }

  listAllAttachments(): AttachmentSchema[] {
    return this.taskModel.listAllAttachments()
  }

  fireTaskCommand(command: TaskCommand): void {
    this._onTaskCommands.fire(command)
  }
  private _onTaskCommands: Emitter<TaskCommand> = new Emitter()
  public onTaskCommands = this._onTaskCommands.event

  undo(): void {
    this.taskModel.undo()
  }
  redo(): void {
    this.taskModel.redo()
  }
  clearUndoHistory(): void {
    this.taskModel.clearUndoHistory()
  }

  createProjectWithChildren(params: CreateProjectWithChildrenParams): TreeID {
    return createProjectWithChildren(this.taskModel, params)
  }

  batchEdit(params: BatchEditParams): BatchEditResult {
    return executeBatchEdit(this.taskModel, params)
  }

  addView(payload: Omit<CreateTaskViewSchema, "schemaVersion">): string {
    return this.taskModel.addView({ ...payload, schemaVersion: VIEW_SCHEMA_VERSION })
  }

  updateView(uid: string, payload: Omit<UpdateTaskViewSchema, "schemaVersion">): void {
    // Re-stamp the writer's schema version whenever the rule itself changes,
    // so the persisted version always reflects the engine that produced the
    // current rule string.
    const next: UpdateTaskViewSchema =
      payload.rule !== undefined ? { ...payload, schemaVersion: VIEW_SCHEMA_VERSION } : payload
    this.taskModel.updateView(uid, next)
  }

  deleteView(uid: string): void {
    this.taskModel.deleteView(uid)
  }

  moveView(uid: string, toIndex: number): void {
    this.taskModel.moveView(uid, toIndex)
  }
}
