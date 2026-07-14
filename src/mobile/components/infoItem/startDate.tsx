import { formatDate } from "@/core/time/formatDate"
import React from "react"

interface StartDateInfoItemProps {
  startDate?: number | undefined
}

export const StartDateInfoItem: React.FC<StartDateInfoItemProps> = ({ startDate }) => {
  return <span>{`${formatDate(startDate)}`}</span>
}
