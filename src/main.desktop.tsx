import "@/locales/browser/config.ts"
import "large-small-dynamic-viewport-units-polyfill"

void import("./desktop/main")
  .then(({ startDesktop }) => startDesktop())
  .catch((error: unknown) => {
    console.error("Failed to start desktop application:", error)
  })
