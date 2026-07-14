export const PWA_UPDATE_READY_EVENT = "unthink:pwa-update-ready"

export function applyServiceWorkerUpdate(registration: ServiceWorkerRegistration): void {
  registration.waiting?.postMessage({ type: "SKIP_WAITING" })
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return
  window.addEventListener(
    "load",
    () => {
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => {
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing
            installing?.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                window.dispatchEvent(new CustomEvent(PWA_UPDATE_READY_EVENT, { detail: registration }))
              }
            })
          })
        })
        .catch((error: unknown) => {
          console.warn("Service worker registration failed:", error)
        })
    },
    { once: true },
  )
}
