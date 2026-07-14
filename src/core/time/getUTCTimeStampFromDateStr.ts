export function getUTCTimeStampFromDateStr(dateStr: string) {
  const parts = dateStr.split("-")
  if (parts.length !== 3) {
    throw new Error("Invalid date format, expected yyyy-MM-dd")
  }
  const [yearPart, monthPart, dayPart] = parts
  if (!yearPart || !monthPart || !dayPart) throw new Error("Invalid date format, expected yyyy-MM-dd")
  const year = parseInt(yearPart, 10)
  const month = parseInt(monthPart, 10)
  const day = parseInt(dayPart, 10)
  const utcMilliseconds = Date.UTC(year, month - 1, day)
  return utcMilliseconds
}
