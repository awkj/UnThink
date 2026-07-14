import { decodeCBOR, decodeCBORSequence, encodeCBOR, encodeCBORSequence } from "./cbor"
import { HttpError } from "./error"

export interface LocalServerClientRequestLibOption {
  method: string
  headers: Record<string, string>
  body?: string | Uint8Array
}

export interface LocalServerClientRequestLibResponse {
  status: number
  body: Uint8Array
  headers: Record<string, string>
}

export interface LocalServerClientRequestLib {
  (url: string, options: LocalServerClientRequestLibOption): Promise<LocalServerClientRequestLibResponse>
}

export interface LocalServerClientOptions {
  endpoint: string
  requestLib: LocalServerClientRequestLib
  authToken: string
}

export type LocalServerErrorResponse = {
  error: string
  code?: string | number
  details?: unknown
}

export type LocalServerResponse<T> = T | LocalServerErrorResponse

export class LocalServerClient {
  constructor(private options: LocalServerClientOptions) {
    if (!options.endpoint) {
      throw new Error("endpoint is required")
    }
    if (!options.authToken) {
      throw new Error("authToken is required")
    }
  }

  post<T>(api: string, data?: unknown) {
    return this.requestJSON<T>("POST", api, data)
  }

  put<T>(api: string, data?: unknown) {
    return this.requestJSON<T>("PUT", api, data)
  }

  get<T>(api: string) {
    return this.requestJSON<T>("GET", api)
  }

  delete(api: string): Promise<void> {
    return this.requestVoid("DELETE", api)
  }

  getCBOR<T>(api: string): Promise<T> {
    return this.requestCBOR<T>("GET", api)
  }

  putCBOR<T>(api: string, data: unknown): Promise<T> {
    return this.requestCBOR<T>("PUT", api, data)
  }

  async getCBORSequence<T>(api: string): Promise<{ values: T[]; headers: Record<string, string> }> {
    const response = await this.requestRaw("GET", api, undefined, "application/cbor-seq")
    this.throwIfError(response)
    this.assertContentType(response, "application/cbor-seq")
    return { values: decodeCBORSequence<T>(response.body), headers: response.headers }
  }

  async postCBORSequence<T>(api: string, values: unknown[]): Promise<T[]> {
    const response = await this.requestRaw(
      "POST",
      api,
      encodeCBORSequence(values),
      "application/cbor-seq",
      "application/cbor-seq",
    )
    this.throwIfError(response)
    this.assertContentType(response, "application/cbor-seq")
    return decodeCBORSequence<T>(response.body)
  }

  private async requestJSON<T>(method: string, api: string, data?: unknown): Promise<T> {
    const response = await this.requestRaw(
      method,
      api,
      data === undefined ? undefined : JSON.stringify(data),
      "application/json",
      "application/json",
    )
    this.throwIfError(response)
    return JSON.parse(new TextDecoder().decode(response.body)) as T
  }

  private async requestCBOR<T>(method: string, api: string, data?: unknown): Promise<T> {
    const response = await this.requestRaw(
      method,
      api,
      data === undefined ? undefined : encodeCBOR(data),
      "application/cbor",
      "application/cbor",
    )
    this.throwIfError(response)
    this.assertContentType(response, "application/cbor")
    return decodeCBOR<T>(response.body)
  }

  private async requestVoid(method: string, api: string): Promise<void> {
    const response = await this.requestRaw(method, api, undefined, "application/json")
    this.throwIfError(response)
  }

  private async requestRaw(
    method: string,
    api: string,
    body: string | Uint8Array | undefined,
    accept: string,
    contentType?: string,
  ): Promise<LocalServerClientRequestLibResponse> {
    const requestLib = this.options.requestLib
    const endpoint = this.options.endpoint.replace(/\/$/, "")
    return requestLib(`${endpoint}/api/${api}`, {
      method: method,
      headers: {
        Accept: accept,
        ...(contentType === undefined ? {} : { "Content-Type": contentType }),
        authorization: `Bearer ${this.options.authToken}`,
      },
      ...(body === undefined ? {} : { body }),
    })
  }

  private throwIfError(response: LocalServerClientRequestLibResponse): void {
    if (response.status < 200 || response.status >= 300) {
      const message = new TextDecoder().decode(response.body)
      try {
        const parsedError = JSON.parse(message) as LocalServerErrorResponse
        throw new HttpError(response.status, parsedError.error, parsedError.code, parsedError.details ?? parsedError)
      } catch (error) {
        if (error instanceof HttpError) {
          throw error
        }
        throw new HttpError(response.status, message)
      }
    }
  }

  private assertContentType(response: LocalServerClientRequestLibResponse, expected: string): void {
    const received = response.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() ?? "missing"
    if (received !== expected) {
      throw new Error(
        `Sync server protocol mismatch: expected ${expected}, received ${received}. ` +
          "Rebuild and redeploy the server and client from the same version.",
      )
    }
  }
}
