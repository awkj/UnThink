import assert from "node:assert/strict"
import test from "node:test"
import { calculateDragPosition } from "./calculateDragPosition"

test("drag position uses the hovered item as the stable before/after anchor", () => {
  const ids = ["a", "b", "c", "d"]
  assert.deepEqual(calculateDragPosition("a", "c", ids), { type: "afterElement", previousElementId: "c" })
  assert.deepEqual(calculateDragPosition("d", "b", ids), { type: "beforeElement", nextElementId: "b" })
})

test("drag position ignores missing or identical items", () => {
  assert.equal(calculateDragPosition("a", "a", ["a"]), null)
  assert.equal(calculateDragPosition("missing", "a", ["a"]), null)
})
