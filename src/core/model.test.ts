import assert from "node:assert/strict"
import test from "node:test"
import { TaskModel } from "./model"

test("task model preserves hierarchy through binary export/import", () => {
  const source = new TaskModel()
  const parentId = source.addTask({ title: "parent" })
  const childId = source.addTask({ title: "child", position: { type: "firstElement", parentId } })

  const restored = new TaskModel()
  restored.import([source.export()])
  const state = restored.toJSON()
  assert.deepEqual(state.taskObjectMap.get(parentId)?.children, [childId])
  assert.equal(state.taskObjectMap.get(childId)?.title, "child")
})

test("explicit null clears a recurring rule while omission preserves it", () => {
  const model = new TaskModel()
  const taskId = model.addTask({ title: "repeat", recurringRule: { startDate: { valid: true, days: 1 } } })
  model.updateTask(taskId, { title: "renamed" })
  const beforeClear = model.toJSON().taskObjectMap.get(taskId)
  assert.deepEqual(beforeClear?.type === "task" ? beforeClear.recurringRule : undefined, {
    startDate: { valid: true, days: 1 },
  })
  model.updateTask(taskId, { recurringRule: null })
  const task = model.toJSON().taskObjectMap.get(taskId)
  assert.equal(task?.type === "task" ? task.recurringRule : undefined, undefined)
})
