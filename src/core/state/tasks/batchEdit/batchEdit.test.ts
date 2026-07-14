import assert from "node:assert/strict"
import test from "node:test"
import { TaskModel } from "@/core/model"
import { batchEdit } from "./batchEdit"

test("batch edit validates and applies grouped add, update, and delete actions", () => {
  const model = new TaskModel()
  const updatedId = model.addTask({ title: "before" })
  const deletedId = model.addTask({ title: "delete me" })

  const result = batchEdit(model, {
    groups: [
      {
        title: "existing tasks",
        actions: [
          { type: "updateTask", taskId: updatedId, title: "after", status: "completed" },
          { type: "deleteItem", itemId: deletedId },
        ],
      },
      {
        title: "new hierarchy",
        actions: [
          {
            type: "addTask",
            title: "parent",
            position: { type: "firstElement" },
            children: ["first", "second"],
          },
        ],
      },
    ],
  })

  assert.deepEqual(result, { success: true, groupsProcessed: 2, actionsProcessed: 3 })
  const state = model.toJSON()
  assert.equal(state.taskObjectMap.get(updatedId)?.title, "after")
  assert.equal(state.taskObjectMap.get(updatedId)?.type, "task")
  assert.equal(state.taskObjectMap.has(deletedId), false)
  const parent = state.taskList.find((item) => item.title === "parent")
  assert.ok(parent)
  assert.deepEqual(
    parent.children.map((id) => state.taskObjectMap.get(id)?.title),
    ["first", "second"],
  )
})

test("batch edit rejects references to missing items before mutating them", () => {
  const model = new TaskModel()
  assert.throws(() =>
    batchEdit(model, {
      groups: [{ title: "invalid", actions: [{ type: "updateTask", taskId: "missing", title: "nope" }] }],
    }),
  )
  assert.equal(model.toJSON().taskList.length, 0)
})
