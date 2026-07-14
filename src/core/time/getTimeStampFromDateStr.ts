export function getTimeStampFromDateStr(dateStr: string): number {
  const parts = dateStr.split("-")
  if (parts.length !== 3) {
    throw new Error("日期格式错误，应为 yyyy-MM-dd 格式")
  }
  const [yearPart, monthPart, dayPart] = parts
  if (!yearPart || !monthPart || !dayPart) throw new Error("日期格式错误，应为 yyyy-MM-dd 格式")
  const year = parseInt(yearPart, 10)
  const month = parseInt(monthPart, 10)
  const day = parseInt(dayPart, 10)
  const utcMilliseconds = new Date(year, month - 1, day)
  return utcMilliseconds.getTime()
}
