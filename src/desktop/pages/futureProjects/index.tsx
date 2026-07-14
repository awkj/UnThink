import { getTodayTimestampInUtc } from "@/core/time/getTodayTimestampInUtc"
import { ThingsLaterIcon } from "@/ui/components/icons"
import { getFutureProjects } from "@/core/state/home/getFutureProjects"
import { EntityHeader } from "@/desktop/components/common/EntityHeader"
import { DesktopProjectList } from "@/desktop/components/DesktopProjectList/DesktopProjectList"
import { useService } from "@/ui/hooks/use-service"
import { useWatchEvent } from "@/ui/hooks/use-watch-event"
import { localize } from "@/nls"
import { ITodoService } from "@/services/todo/todoService"
import { desktopStyles } from "@/desktop/theme/main"

export const FutureProjects = () => {
  const todoService = useService(ITodoService)
  useWatchEvent(todoService.onStateChange)

  const futureProjects = getFutureProjects(todoService.modelState, getTodayTimestampInUtc())

  return (
    <div className={desktopStyles.FutureProjectsPageContainer}>
      <div className={desktopStyles.FutureProjectsPageWrapper}>
        <EntityHeader renderIcon={() => <ThingsLaterIcon />} title={localize("futureProjects", "Future Projects")} />
        <div className={desktopStyles.FutureProjectsPageContent}>
          <DesktopProjectList
            projects={futureProjects}
            emptyStateLabel={localize("futureProjects.empty", "No future projects")}
          />
        </div>
      </div>
    </div>
  )
}
