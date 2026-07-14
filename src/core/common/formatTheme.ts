export function formatTheme(theme: Record<string, string>, extra?: Record<string, string>): void {
  const clone: Record<string, string> = { ...theme }
  if (extra) {
    Object.entries(extra).forEach(([key, value]) => {
      clone[key] = value
    })
  }

  Object.keys(clone).forEach((key) => {
    const value = clone[key]
    if (value !== undefined) theme[key] = value
  })
  Object.freeze(theme)
}
