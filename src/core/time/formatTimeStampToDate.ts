import { format } from "date-fns/format"

export function formatTimeStampToDate(timestamp: number) {
  return format(timestamp, "yyyy-MM-dd")
}
