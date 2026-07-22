import { enUS } from "date-fns/locale/en-US"
import { zhCN } from "date-fns/locale/zh-CN"

export const languageOptions = [
  {
    label: "English",
    value: "en-US",
  },
  {
    label: "简体中文",
    value: "zh-CN",
  },
]

const locals = {
  "en-US": ["en-US", "en"],
  "zh-CN": ["zh-CN", "zh"],
} as const

export type SupportedLocale = keyof typeof locals

let currentLocale: SupportedLocale = "en-US"

export function getDateFnsLocale() {
  const locale = getCurrentLocale()
  switch (locale) {
    case "en-US":
      return enUS
    case "zh-CN":
      return zhCN
  }
  return enUS
}

export function getCurrentLocale(): SupportedLocale {
  return currentLocale
}

export function setCurrentLocale(locale: SupportedLocale): void {
  currentLocale = locale
}

export function getValidLocaleKey(configLanguage: string): SupportedLocale {
  let finalLocal: SupportedLocale = "en-US"
  Object.keys(locals).forEach((key: string) => {
    const alias = locals[key as keyof typeof locals]
    if ((alias as readonly string[]).includes(configLanguage)) {
      finalLocal = key as SupportedLocale
    }
  })

  return finalLocal
}
