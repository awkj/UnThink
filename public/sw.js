const CACHE_NAME = "unthink-shell-v4"
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.ico"]

async function productionAssets() {
  try {
    const response = await fetch("/.vite/manifest.json", { cache: "no-store" })
    if (!response.ok) return []
    const manifest = await response.json()
    const files = new Set()
    for (const entry of Object.values(manifest)) {
      if (entry.file) files.add(`/${entry.file}`)
      for (const file of entry.css || []) files.add(`/${file}`)
      for (const file of entry.assets || []) files.add(`/${file}`)
    }
    return [...files]
  } catch {
    return []
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL)
      const assets = await productionAssets()
      await Promise.allSettled(assets.map((asset) => cache.add(asset)))
    }),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting()
  }
  if (event.data?.type === "GET_VERSION") {
    event.ports[0]?.postMessage(CACHE_NAME)
  }
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html", { ignoreVary: true })))
    return
  }

  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok && url.pathname.startsWith("/assets/")) {
          const copy = response.clone()
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
