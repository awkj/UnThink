import { getCurrentDateStr } from "./getCurrentDateStr"
import { getUTCTimeStampFromDateStr } from "./getUTCTimeStampFromDateStr"

export function getTodayTimestampInUtc() {
  return getUTCTimeStampFromDateStr(getCurrentDateStr()).valueOf()
}
