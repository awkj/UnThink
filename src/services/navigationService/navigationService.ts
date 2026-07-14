import { Emitter, Event } from "@hamsterbase/foundation/event"
import { createDecorator } from "@hamsterbase/foundation/instantiation"
import { IDisposable } from "@hamsterbase/foundation/lifecycle"

export interface NavigateOptions {
  path: string
  replace?: boolean
}

export function getNavigationPathFromDeepLink(value: string): string | null {
  const url = new URL(value)
  if (url.protocol !== "unthink:") return null
  const destination = url.pathname.split("/").filter(Boolean).at(-1)
  return destination === "today" || destination === "inbox" ? `/${destination}` : null
}

export interface INavigationService {
  readonly _serviceBrand: undefined

  /**
   * Event that fires when navigation is requested
   */
  readonly onNavigate: Event<NavigateOptions>

  /**
   * Navigate to a specific path
   * @param options Navigation options containing path and optional replace flag
   */
  navigate(options: NavigateOptions): void

  listenBackButton(callback: () => void): IDisposable

  /**
   * Navigate backward in history
   */
  goBack(): void

  /**
   * Navigate forward in history
   */
  goForward(): void

  /**
   * Event that fires when back navigation is requested
   */
  readonly onGoBack: Event<void>

  /**
   * Event that fires when forward navigation is requested
   */
  readonly onGoForward: Event<void>
}

export class NavigationService implements INavigationService {
  public readonly _serviceBrand: undefined

  private readonly _onNavigate = new Emitter<NavigateOptions>()
  private readonly _onGoBack = new Emitter<void>()
  private readonly _onGoForward = new Emitter<void>()

  private backButtonListener: Array<() => void> = []

  constructor() {
    if ("__TAURI_INTERNALS__" in window) {
      const navigateFromDeepLink = (urls: string[]) => {
        const path = urls.map(getNavigationPathFromDeepLink).find((value) => value !== null)
        if (path) this.navigate({ path })
      }
      void import("@tauri-apps/plugin-deep-link")
        .then(async ({ getCurrent, onOpenUrl }) => {
          navigateFromDeepLink((await getCurrent()) ?? [])
          await onOpenUrl(navigateFromDeepLink)
        })
        .catch((error: unknown) => console.error("Failed to register deep-link navigation:", error))
      void import("@tauri-apps/api/app")
        .then(({ onBackButtonPress }) => onBackButtonPress(() => this.dispatchBackButton()))
        .catch((error: unknown) => console.error("Failed to register native back handler:", error))
      void import("@tauri-apps/api/event")
        .then(({ listen }) =>
          listen<string>("native-navigate", ({ payload }) => {
            this.navigate({ path: payload })
          }),
        )
        .catch((error: unknown) => console.error("Failed to register native navigation handler:", error))
    }
  }

  get onNavigate(): Event<NavigateOptions> {
    return this._onNavigate.event
  }

  get onGoBack(): Event<void> {
    return this._onGoBack.event
  }

  get onGoForward(): Event<void> {
    return this._onGoForward.event
  }

  navigate(options: NavigateOptions): void {
    this._onNavigate.fire(options)
  }

  goBack(): void {
    this._onGoBack.fire()
  }

  goForward(): void {
    this._onGoForward.fire()
  }

  listenBackButton(callback: () => void): IDisposable {
    this.backButtonListener.push(callback)
    return {
      dispose: () => {
        this.backButtonListener = this.backButtonListener.filter((item) => item !== callback)
      },
    }
  }

  private dispatchBackButton(): void {
    this.backButtonListener.at(-1)?.()
  }
}

export const INavigationService = createDecorator<INavigationService>("navigationService")
