import { LocalServerClient, LocalServerClientOptions, LocalServerClientRequestLibOption } from "./client"
import { Sync } from "./sync"

export class LocalServerSDK {
  static fetchToRequestLib = (fetch: typeof globalThis.fetch) => {
    return async (url: string, options: LocalServerClientRequestLibOption) => {
      const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        ...(options.body === undefined ? {} : { body: options.body as BodyInit }),
      })
      const status = response.status
      const body = new Uint8Array(await response.arrayBuffer())
      const headers = Object.fromEntries(response.headers.entries())
      return { status, body, headers }
    }
  }

  private readonly client: LocalServerClient

  public sync: Sync

  constructor(private options: LocalServerClientOptions) {
    this.client = new LocalServerClient(options)
    this.sync = new Sync(this.client)
  }

  clone() {
    return new LocalServerSDK(this.options)
  }
}
