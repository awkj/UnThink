import assert from "node:assert/strict"
import test from "node:test"
import { mergeDateAndTime } from "./mergeDateAndTime"

test("mergeDateAndTime keeps the calendar date and copies the complete time", () => {
  const date = new Date(2026, 6, 14, 1, 2, 3, 4)
  const time = new Date(2000, 0, 1, 18, 45, 32, 987)

  assert.deepEqual(mergeDateAndTime(date, time), new Date(2026, 6, 14, 18, 45, 32, 987))
})

test("mergeDateAndTime accepts epoch timestamps", () => {
  const date = new Date(2027, 10, 8)
  const time = new Date(2000, 0, 1, 6, 7, 8, 9)

  assert.deepEqual(mergeDateAndTime(date.getTime(), time.getTime()), new Date(2027, 10, 8, 6, 7, 8, 9))
})
