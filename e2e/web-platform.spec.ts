import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => console.error(`[browser page error] ${error.stack ?? error.message}`))
})

test("OPFS database adapter creates a valid manifest-backed local database", async ({ page }) => {
  await page.goto("/desktop/inbox")
  await expect(page.locator("#root")).not.toBeEmpty({ timeout: 15_000 })
  const storageState = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const data = await root.getDirectoryHandle("data")
    const version = await data.getDirectoryHandle("v1")
    const database = await version.getDirectoryHandle("db-local")
    const manifestFile = await (await database.getFileHandle("manifest.json")).getFile()
    const manifest = JSON.parse(await manifestFile.text()) as {
      formatVersion: number
      generation: number
      snapshot?: { file: string; size: number }
      wal: Array<{ file: string; sequence: number }>
    }
    const snapshotSize = manifest.snapshot
      ? (await (await database.getFileHandle(manifest.snapshot.file)).getFile()).size
      : 0
    return { manifest, snapshotSize }
  })
  expect(storageState.manifest.formatVersion).toBe(1)
  expect(storageState.manifest.generation).toBeGreaterThan(0)
  expect(storageState.snapshotSize).toBeGreaterThan(0)
  expect(storageState.manifest.wal.map((entry) => entry.sequence)).toEqual(
    [...storageState.manifest.wal].map((entry) => entry.sequence).sort((left, right) => left - right),
  )
})

test("cold browser startup stays within budget", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "desktop cold-start budget is the canonical CI sample")
  const startedAt = performance.now()
  await page.goto("/desktop/inbox")
  await expect(page.locator("#root")).not.toBeEmpty({ timeout: 5_000 })
  expect(performance.now() - startedAt).toBeLessThan(5_000)
})

test("desktop and mobile routes survive a hard refresh", async ({ page }, testInfo) => {
  const path = testInfo.project.name === "mobile-chromium" ? "/today" : "/desktop/today"
  await page.goto(path)
  await page.reload()
  await expect(page).toHaveURL(new RegExp(`${path}$`))
  await expect(page.locator("#root")).not.toBeEmpty({ timeout: 15_000 })
})

test("service worker starts the app shell offline", async ({ page, context }) => {
  await page.goto("/desktop/inbox")
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const entry = document.querySelector<HTMLScriptElement>('script[type="module"]')?.src
          return Boolean(navigator.serviceWorker.controller && entry && (await caches.match(entry)))
        }),
      { timeout: 15_000 },
    )
    .toBe(true)
  const cacheStatus = await page.evaluate(async () => {
    const manifest = (await (await fetch("/.vite/manifest.json")).json()) as Record<
      string,
      { file?: string; css?: string[]; assets?: string[] }
    >
    const files = Object.values(manifest).flatMap((entry) => [
      entry.file,
      ...(entry.css ?? []),
      ...(entry.assets ?? []),
    ])
    const missing = []
    for (const file of files) {
      if (file && !(await caches.match(`/${file}`))) missing.push(file)
    }
    return { files: files.length, missing: [...new Set(missing)] }
  })
  expect(cacheStatus.missing, `uncached production assets out of ${cacheStatus.files}`).toEqual([])
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator("#root")).not.toBeEmpty({ timeout: 15_000 })
  await context.setOffline(false)
})

test("PWA registration checks for updates and reports its active version", async ({ page }) => {
  await page.goto("/desktop/inbox")
  const version = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    await registration.update()
    const worker = registration.active
    if (!worker) throw new Error("No active service worker")
    return await new Promise<string>((resolve, reject) => {
      const channel = new MessageChannel()
      const timeout = window.setTimeout(() => reject(new Error("Service worker version timeout")), 2_000)
      channel.port1.onmessage = (event: MessageEvent<string>) => {
        clearTimeout(timeout)
        resolve(event.data)
      }
      worker.postMessage({ type: "GET_VERSION" }, [channel.port2])
    })
  })
  expect(version).toBe("unthink-shell-v4")
})
