/// <reference lib="webworker" />

import { TaskModel } from "@/core/model"

type WorkerRequest =
  | { type: "init"; updates: ArrayBuffer[] }
  | { type: "import"; updates: ArrayBuffer[] }
  | { type: "snapshot"; requestId: number }

type WorkerResponse = { type: "snapshot"; requestId: number; snapshot: ArrayBuffer }

const model = new TaskModel()

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (message.type === "init" || message.type === "import") {
    model.import(message.updates.map((update) => new Uint8Array(update)))
    return
  }
  const snapshot = Uint8Array.from(model.export()).buffer
  const response: WorkerResponse = { type: "snapshot", requestId: message.requestId, snapshot }
  self.postMessage(response, { transfer: [snapshot] })
})
