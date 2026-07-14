import { Decoder, Encoder, type Options } from "cbor-x"

type InteroperableDecoderOptions = Options & { int64AsNumber: boolean }

const encoder = new Encoder({
  useRecords: false,
  tagUint8Array: false,
  variableMapSize: true,
})

const decoderOptions: InteroperableDecoderOptions = {
  useRecords: false,
  mapsAsObjects: true,
  int64AsNumber: true,
}

const decoder = new Decoder(decoderOptions)

export function encodeCBOR(value: unknown): Uint8Array {
  return encoder.encode(value)
}

export function encodeCBORSequence(values: unknown[]): Uint8Array {
  const encoded = values.map((value) => encodeCBOR(value))
  const size = encoded.reduce((total, item) => total + item.byteLength, 0)
  const sequence = new Uint8Array(size)
  let offset = 0
  for (const item of encoded) {
    sequence.set(item, offset)
    offset += item.byteLength
  }
  return sequence
}

export function decodeCBOR<T>(data: Uint8Array): T {
  return decoder.decode(data) as T
}

export function decodeCBORSequence<T>(data: Uint8Array): T[] {
  if (data.byteLength === 0) return []
  return decoder.decodeMultiple(data) as T[]
}
