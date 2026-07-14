import { getTodayTimestampInUtc } from "@/core/time/getTodayTimestampInUtc"

export function isTimestampInPast(date?: number) {
  if (!date) {
    return false
  }
  return date < Date.now()
}

export function isPastOrToday(date?: number) {
  if (!date) {
    return false
  }
  return date <= getTodayTimestampInUtc()
}
