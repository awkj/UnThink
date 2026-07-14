import { getTodayTimestampInUtc } from "@/core/time/getTodayTimestampInUtc"
import { CalendarIcon, CheckIcon, InboxIcon, ThingsAIIcon, TodayIcon } from "@/ui/components/icons"
import { getInboxTasks } from "@/core/state/inbox/getInboxTasks"
import { getTodayItems } from "@/core/state/today/getTodayItems"
import { useConfig } from "@/ui/hooks/useConfig"
import { useService } from "@/ui/hooks/use-service"
import { useWatchEvent } from "@/ui/hooks/use-watch-event"
import { useTaskDisplaySettings } from "@/ui/hooks/useTaskDisplaySettings"
import { localize } from "@/nls"
import { hideAIEntryConfigKey } from "@/services/config/config"
import { ITodoService } from "@/services/todo/todoService.ts"
import classNames from "classnames"
import React from "react"
import { desktopStyles } from "../../../theme/main"
import { MenuItem } from "../../MenuItem/MenuItem.tsx"

const aiChatLink = { to: "/desktop/ai-chat", text: localize("ai_chat", "AI Chat"), icon: <ThingsAIIcon /> }
const baseLinks = [
  {
    to: "/desktop/inbox",
    text: localize("inbox", "Inbox"),
    icon: <InboxIcon className="text-module-inbox" strokeWidth={1.5} />,
  },
  {
    to: "/desktop/today",
    text: localize("today", "Today"),
    icon: <TodayIcon className="text-module-today" strokeWidth={1.5} />,
  },
  {
    to: "/desktop/schedule",
    text: localize("schedule", "Schedule"),
    icon: <CalendarIcon className="text-module-scheduled" strokeWidth={1.5} />,
  },
  {
    to: "/desktop/completed",
    text: localize("completed", "Completed"),
    icon: <CheckIcon className="text-module-completed" strokeWidth={1.5} />,
  },
]

export const SidebarMenu: React.FC = () => {
  const todoService = useService(ITodoService)
  useWatchEvent(todoService.onStateChange)
  const { value: hideAIEntry } = useConfig(hideAIEntryConfigKey())
  const links = hideAIEntry ? baseLinks : [aiChatLink, ...baseLinks]
  const todayItems = getTodayItems(todoService.modelState, getTodayTimestampInUtc())
  const { showFutureTasks, showCompletedTasks, completedAfter } = useTaskDisplaySettings("inbox")
  const { uncompletedTasksCount } = getInboxTasks(todoService.modelState, {
    currentDate: getTodayTimestampInUtc(),
    showFutureTasks,
    showCompletedTasks,
    showCompletedTasksAfter: completedAfter,
    keepAliveElements: todoService.keepAliveElements,
  })

  return (
    <ul className={classNames(desktopStyles.SidebarMenuItemContainer, desktopStyles.SidebarPrimaryMenuSpacing)}>
      {links.map((link) => {
        const isTodayLink = link.to === "/desktop/today"
        const isInboxLink = link.to === "/desktop/inbox"
        const startDateCount = isTodayLink ? todayItems.startDateItemsCount : 0
        const dueDateCount = isTodayLink ? todayItems.dueDateItemsCount : 0
        return (
          <MenuItem
            key={link.to}
            to={link.to}
            text={link.text}
            icon={link.icon}
            className={isInboxLink ? desktopStyles.SidebarInboxMenuItem : undefined}
            primaryBadge={isTodayLink && dueDateCount > 0 ? dueDateCount : undefined}
            secondaryBadge={
              isTodayLink && startDateCount > 0
                ? startDateCount
                : isInboxLink && uncompletedTasksCount > 0
                  ? uncompletedTasksCount
                  : undefined
            }
          />
        )
      })}

      <div className={desktopStyles.SidebarMenuDivider}></div>
    </ul>
  )
}
