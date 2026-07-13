export interface ICheckPlatform {
  platform: string
  isNative: boolean
  isAndroid: boolean
  isWeb: boolean
  isTauri: boolean
  isMac: boolean
  isLinux: boolean
  prefersMobileLayout: boolean
}

export function checkPlatform(): ICheckPlatform {
  const userAgent = navigator.userAgent.toLowerCase()
  const isTauri = "__TAURI_INTERNALS__" in window
  const isAndroid = userAgent.includes("android")
  const isNative = isTauri && isAndroid
  const platform = isAndroid ? "android" : "web"

  // Check OS platform using userAgent since navigator.platform is deprecated
  const isMac = userAgent.indexOf("mac") >= 0 || userAgent.indexOf("darwin") >= 0
  const isLinux = userAgent.indexOf("linux") >= 0 && userAgent.indexOf("android") === -1
  const prefersMobileLayout =
    isAndroid ||
    matchMedia("(max-width: 767px)").matches ||
    matchMedia("(pointer: coarse) and (max-width: 1024px)").matches

  return {
    platform,
    isNative,
    isAndroid,
    isWeb: !isTauri,
    isTauri,
    isMac,
    isLinux,
    prefersMobileLayout,
  }
}
