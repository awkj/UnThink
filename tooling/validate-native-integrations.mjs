import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const read = (file) => readFile(file, "utf8")
const [gradle, manifest, rust, config, navigation, project, intents, widget] = await Promise.all([
  read("src-tauri/gen/android/app/build.gradle.kts"),
  read("src-tauri/gen/android/app/src/main/AndroidManifest.xml"),
  read("src-tauri/src/lib.rs"),
  read("src-tauri/tauri.conf.json"),
  read("src/services/navigationService/navigationService.ts"),
  read("src-tauri/apple/project.yml"),
  read("src-tauri/apple/Intents/OpenUnthinkIntent.swift"),
  read("src-tauri/apple/Widget/UnthinkWidget.swift"),
])

assert.match(gradle, /val deprecated = "this@WryActivity\.onBackPressed\(\)"/)
assert.match(gradle, /source\.replace\(deprecated, "this@WryActivity\.onBackPressedDispatcher\.onBackPressed\(\)"\)/)
assert.match(manifest, /android:enableOnBackInvokedCallback="true"/)
assert.match(rust, /native_navigation_route/)
assert.match(rust, /tauri_plugin_deep_link::init/)
assert.match(config, /"schemes": \["unthink"\]/)
assert.match(navigation, /onOpenUrl\(navigateFromDeepLink\)/)
assert.match(project, /com\.apple\.appintents-extension/)
assert.match(project, /com\.apple\.widgetkit-extension/)
assert.match(intents, /CSSearchableIndex\.default\(\)/)
assert.match(widget, /UnthinkDestination\.today\.url/)
console.log("Native menu, predictive-back, App Intents, Spotlight, and Widget contracts passed.")
