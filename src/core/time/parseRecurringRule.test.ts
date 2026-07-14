import assert from "node:assert/strict"
import test from "node:test"
import { parseRecurringRule } from "./parseRecurringRule"

test("recurring rules parse compound intervals and an optional origin", () => {
  assert.deepEqual(parseRecurringRule("completion:1y2m3w-4d"), {
    valid: true,
    from: "completion",
    years: 1,
    months: 2,
    weeks: 3,
    days: -4,
  })
  assert.deepEqual(parseRecurringRule("2w"), { valid: true, years: 0, months: 0, weeks: 2, days: 0 })
})

test("recurring rules reject empty, zero, partial, and over-segmented input", () => {
  for (const input of ["", "0d", "1w garbage", "a:b:c"]) {
    assert.equal(parseRecurringRule(input).valid, false, input)
  }
})
