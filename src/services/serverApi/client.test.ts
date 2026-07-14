import { describe, expect, it } from "vitest"
import { LocalServerClient } from "./client"

describe("LocalServerClient protocol validation", () => {
  it("rejects an old JSON changes response before CBOR decoding", async () => {
    const client = new LocalServerClient({
      endpoint: "https://sync.example.test",
      authToken: "token",
      requestLib: async () => ({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: new TextEncoder().encode('{"revision":13,"changes":[]}'),
      }),
    })

    await expect(client.getCBORSequence("v1/spaces/default/changes")).rejects.toThrow(
      "expected application/cbor-seq, received application/json",
    )
  })
})
