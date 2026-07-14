import { readdir, stat } from "node:fs/promises"
import path from "node:path"

const assetsDirectory = path.resolve("dist/assets")
const maximumJavaScriptBytes = 350 * 1024
const assetNames = await readdir(assetsDirectory)
const JavaScriptAssets = await Promise.all(
  assetNames
    .filter((name) => name.endsWith(".js"))
    .map(async (name) => ({ name, bytes: (await stat(path.join(assetsDirectory, name))).size })),
)
const oversized = JavaScriptAssets.filter((asset) => asset.bytes > maximumJavaScriptBytes).sort(
  (left, right) => right.bytes - left.bytes,
)

if (oversized.length > 0) {
  const details = oversized.map((asset) => `  ${asset.name}: ${(asset.bytes / 1024).toFixed(1)} KiB`).join("\n")
  throw new Error(`JavaScript chunk budget exceeded (350 KiB):\n${details}`)
}

const largest = JavaScriptAssets.sort((left, right) => right.bytes - left.bytes)[0]
console.log(
  largest
    ? `Bundle budget passed; largest JavaScript chunk is ${largest.name} (${(largest.bytes / 1024).toFixed(1)} KiB).`
    : "Bundle budget passed; no JavaScript chunks were emitted.",
)
