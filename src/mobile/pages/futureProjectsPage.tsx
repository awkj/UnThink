import { getTodayTimestampInUtc } from "@/core/time/getTodayTimestampInUtc"
import { LaterProjectsIcon } from "@/ui/components/icons"
import { getFutureProjects } from "@/core/state/home/getFutureProjects"
import { useService } from "@/ui/hooks/use-service.ts"
import { useWatchEvent } from "@/ui/hooks/use-watch-event.ts"
import { HomeProjectItem } from "@/mobile/components/todo/HomeProjectItem"
import { ITodoService } from "@/services/todo/todoService.ts"
import { localize } from "@/nls"
import { PageLayout } from "../components/PageLayout"
import classNames from "classnames"
import { styles } from "../theme"

export const FutureProjectsPage = () => {
  const todoService = useService(ITodoService)
  useWatchEvent(todoService.onStateChange)

  const futureProjects = getFutureProjects(todoService.modelState, getTodayTimestampInUtc())

  return (
    <PageLayout
      header={{
        showBack: true,
        title: localize("futureProjects", "Future Projects"),
        renderIcon: (className) => <LaterProjectsIcon className={className} />,
        id: "future-projects",
      }}
    >
      <div className={classNames(styles.taskItemGroupBackground, styles.taskItemGroupRound)}>
        {futureProjects.map((project) => (
          <HomeProjectItem projectInfo={project} key={project.id} />
        ))}
      </div>
    </PageLayout>
  )
}
