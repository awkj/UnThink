import { performance } from "node:perf_hooks"
import { TaskModel } from "../src/core/model"

const taskCount = Number(process.env.BENCH_TASKS ?? 100_000)
const updateCount = Number(process.env.BENCH_UPDATES ?? 10_000)

async function measure(name: string, budgetMs: number, operation: () => void | Promise<void>) {
  const startedAt = performance.now()
  await operation()
  const elapsed = performance.now() - startedAt
  console.log(`${name}: ${elapsed.toFixed(1)}ms (budget ${budgetMs}ms)`)
  if (elapsed > budgetMs) throw new Error(`${name} exceeded its performance budget`)
}

let largeSnapshot = new Uint8Array()
await measure(`create and compact ${taskCount.toLocaleString("en-US")} tasks`, 180_000, () => {
  const model = new TaskModel()
  for (let index = 0; index < taskCount; index += 1) model.addTask({ title: `task-${index}` })
  largeSnapshot = model.export()
})

await measure(`cold load ${taskCount.toLocaleString("en-US")} tasks`, 75_000, () => {
  const model = new TaskModel()
  model.import([largeSnapshot])
  if (model.toJSON().taskList.length !== taskCount) throw new Error("cold-load fixture was incomplete")
})

const updateSource = new TaskModel()
const updates: Uint8Array[] = []
updateSource.onLocalUpdate((update) => updates.push(Uint8Array.from(update)))
for (let index = 0; index < updateCount; index += 1) updateSource.addTask({ title: `update-${index}` })

await measure(`apply ${updateCount.toLocaleString("en-US")} incremental updates`, 15_000, () => {
  const target = new TaskModel()
  target.import(updates)
  if (target.toJSON().taskList.length !== updateCount) throw new Error("incremental fixture was incomplete")
})
