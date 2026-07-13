export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return
  window.addEventListener(
    "load",
    () => {
      void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        console.warn("Service worker registration failed:", error)
      })
    },
    { once: true },
  )
}
