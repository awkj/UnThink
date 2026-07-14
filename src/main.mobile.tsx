import "@/locales/browser/config.ts"
import "large-small-dynamic-viewport-units-polyfill"

import { startMobile } from "./mobile/main"

void startMobile().catch((error: unknown) => {
  console.error("Failed to start mobile application:", error)
})
