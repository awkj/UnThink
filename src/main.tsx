import "@/locales/browser/config.ts"
import "large-small-dynamic-viewport-units-polyfill"

import { checkPlatform } from "@/ui/browser/checkPlatform"
import { registerServiceWorker } from "@/ui/browser/registerServiceWorker"

function shouldLoadDesktop() {
  const platform = checkPlatform()
  if (platform.isTauri && !platform.isNative) {
    return true
  }
  const pathname = location.pathname
  if (pathname !== "/") {
    return pathname.startsWith("/desktop")
  }
  return !platform.prefersMobileLayout
}

async function startApplication(): Promise<void> {
  if (checkPlatform().isWeb) registerServiceWorker()
  if (shouldLoadDesktop()) {
    const { startDesktop } = await import("./desktop/main")
    await startDesktop()
  } else {
    const { startMobile } = await import("./mobile/main")
    await startMobile()
  }
}

void startApplication().catch((error: unknown) => {
  console.error("Failed to start application:", error)
})
