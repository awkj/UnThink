import { Archive, BookCheck, Bookmark, CalendarDays, Inbox, Layers, Sparkles, Star, Trash2 } from "lucide-react"
import React from "react"

type ThingsIconProps = Omit<React.ComponentProps<typeof Inbox>, "color" | "strokeWidth" | "absoluteStrokeWidth">

const STROKE_WIDTH = 3

/** Lucide geometry with a shared optical weight and navigation color semantics. */
export const ThingsInboxIcon: React.FC<ThingsIconProps> = (props) => (
  <Inbox {...props} color="#20A8E8" strokeWidth={STROKE_WIDTH} absoluteStrokeWidth />
)

export const ThingsTodayIcon: React.FC<ThingsIconProps> = (props) => (
  <Star {...props} color="#FFC61A" fill="#FFC61A" strokeWidth={2.2} absoluteStrokeWidth strokeLinejoin="round" />
)

export const ThingsScheduleIcon: React.FC<ThingsIconProps> = (props) => (
  <CalendarDays {...props} color="#FF4F72" strokeWidth={STROKE_WIDTH} absoluteStrokeWidth />
)

export const ThingsAnytimeIcon: React.FC<ThingsIconProps> = (props) => (
  <Layers {...props} color="#A98224" strokeWidth={STROKE_WIDTH} absoluteStrokeWidth />
)

export const ThingsSomedayIcon: React.FC<ThingsIconProps> = (props) => (
  <Archive {...props} color="#C9B968" strokeWidth={STROKE_WIDTH} absoluteStrokeWidth />
)

export const ThingsLogbookIcon: React.FC<ThingsIconProps> = (props) => (
  <BookCheck {...props} color="#46C667" strokeWidth={STROKE_WIDTH} absoluteStrokeWidth />
)

export const ThingsDeletedIcon: React.FC<ThingsIconProps> = (props) => (
  <Trash2 {...props} color="#AEB4BC" fill="#D5D9DE" strokeWidth={2.2} absoluteStrokeWidth />
)

export const ThingsAIIcon: React.FC<ThingsIconProps> = (props) => (
  <Sparkles {...props} color="#8B6EE8" strokeWidth={STROKE_WIDTH} absoluteStrokeWidth />
)

export const ThingsAreaIcon: React.FC<ThingsIconProps> = (props) => (
  <Layers {...props} color="#36B8AD" strokeWidth={STROKE_WIDTH} absoluteStrokeWidth />
)

export const ThingsViewIcon: React.FC<ThingsIconProps> = (props) => (
  <Bookmark {...props} color="#9AA2AC" strokeWidth={STROKE_WIDTH} absoluteStrokeWidth />
)

export const ThingsLaterIcon: React.FC<ThingsIconProps> = (props) => (
  <Archive {...props} color="#C9B968" strokeWidth={STROKE_WIDTH} absoluteStrokeWidth />
)
