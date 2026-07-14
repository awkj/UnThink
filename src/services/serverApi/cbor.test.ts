import { describe, expect, it } from "vitest"
import { decodeCBOR, decodeCBORSequence, encodeCBOR, encodeCBORSequence } from "./cbor"

describe("CBOR sync encoding", () => {
  it("encodes payloads as byte strings without record extensions", () => {
    const encoded = encodeCBOR({ payload: new Uint8Array([1, 2, 3]) })
    const decoded = decodeCBOR<{ payload: Uint8Array }>(encoded)

    expect(decoded.payload).toBeInstanceOf(Uint8Array)
    expect([...decoded.payload]).toEqual([1, 2, 3])
    expect(encoded[0]! >> 5).toBe(5)
  })

  it("round-trips independent CBOR sequence items", () => {
    const encoded = encodeCBORSequence([
      { revision: 1, payload: new Uint8Array([10]) },
      { revision: 2, payload: new Uint8Array([20, 30]) },
    ])
    const decoded = decodeCBORSequence<{ revision: number; payload: Uint8Array }>(encoded)

    expect(decoded.map((item) => item.revision)).toEqual([1, 2])
    expect(decoded.map((item) => [...item.payload])).toEqual([[10], [20, 30]])
  })

  it("decodes 64-bit timestamps as safe JavaScript numbers", () => {
    const decoded = decodeCBOR<{ createdAt: number }>(encodeCBOR({ createdAt: 1_784_050_001_000 }))

    expect(decoded.createdAt).toBe(1_784_050_001_000)
    expect(typeof decoded.createdAt).toBe("number")
  })
})
