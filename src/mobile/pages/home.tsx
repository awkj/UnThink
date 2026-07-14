import { getTodayTimestampInUtc } from "@/core/time/getTodayTimestampInUtc"
import { House, SettingsIcon, SyncIcon } from "@/ui/components/icons"
import {
  CreateAreaMenuIcon,
  CreateProjectMenuIcon,
  CreateTaskMenuIcon,
  CreateViewMenuIcon,
} from "@/ui/components/icons/CreateMenuIcons.tsx"
import { FlattenedResult } from "@/core/state/home/flattenedItemsToResult.ts"
import { flattenRootCollections } from "@/core/state/home/getFlattenRootCollections.ts"
import { getFutureProjects } from "@/core/state/home/getFutureProjects.ts"
import { AreaInfoState, ProjectInfoState } from "@/core/state/type.ts"
import { useService } from "@/ui/hooks/use-service"
import { useWatchEvent } from "@/ui/hooks/use-watch-event"
import { useConfig } from "@/ui/hooks/useConfig.ts"
import { useDragSensors } from "@/ui/hooks/useDragSensors.ts"
import useNavigate from "@/ui/hooks/useNavigate.ts"
import { useScrollPosition } from "@/ui/hooks/useScrollPosition.ts"
import { FutureProjects } from "@/mobile/components/dnd/futureProjects.tsx"
import { computeFlattenedRounding } from "@/mobile/components/dnd/projectedRounding.ts"
import { HomePageProjectItem } from "@/mobile/components/todo/HomePageProjectItem.tsx"
import { HomePageProjectOverlayItem } from "@/mobile/components/todo/HomePageProjectOverlayItem.tsx"
import { localize } from "@/nls.ts"
import { toggleAreaConfigKey } from "@/services/config/config.ts"
import { INavigationService } from "@/services/navigationService/navigationService.ts"
import { ISelfhostedSyncService } from "@/services/selfhostedSync/selfhostedSyncService.ts"
import { ITodoService } from "@/services/todo/todoService.ts"
import { DragDropElements } from "@/core/dnd/dragDropCollision.ts"
import { getFlattenedItemsCollisionDetectionStrategy } from "@/core/dnd/flattenedItemsCollisionDetectionStrategy.ts"
import { getFlattenedItemsDragEndPosition } from "@/core/dnd/flattenedItemsDragPosition.ts"
import { DragEndEvent, useDndContext } from "@dnd-kit/core"
import classNames from "classnames"
import React from "react"
import { InboxDropZone } from "../components/dnd/InboxDropZone.tsx"
import { LastPlacement } from "../components/dnd/lastPlacement.tsx"
import { PageLayout } from "../components/PageLayout.tsx"
import { AreaHeader } from "../components/todo/AreaHeader.tsx"
import { usePopupAction } from "../overlay/popupAction/usePopupAction.ts"
import { useToast } from "../overlay/toast/useToast.ts"
import { styles } from "../theme.ts"
import { MobileHomeTopMenu } from "./home/TopMenu"
import { MobileHomeViewsSection } from "./home/ViewsSection"

interface HomeProjectAndAreaProps {
  flattenedResult: FlattenedResult<AreaInfoState, ProjectInfoState>
  unstartedProjects: ProjectInfoState[]
}

const HomeProjectAndArea: React.FC<HomeProjectAndAreaProps> = ({ flattenedResult, unstartedProjects }) => {
  const { active, over } = useDndContext()
  const rounding = computeFlattenedRounding(
    flattenedResult,
    active?.id as string | undefined,
    over?.id as string | undefined,
  )

  return (
    <React.Fragment>
      <div>
        {flattenedResult.flattenedItems.slice(0, -2).map((item) => {
          if (item.type === "special") {
            if (item.id === DragDropElements.futureProjects) {
              return (
                <FutureProjects
                  key={item.id}
                  unstartedProjects={unstartedProjects}
                  className={classNames(styles.taskItemGroupBackground, styles.homeCardShadow, {
                    [styles.taskItemGroupTopRound]: rounding.top.has(item.id),
                    [styles.taskItemGroupBottomRound]: rounding.bottom.has(item.id),
                  })}
                />
              )
            }
            return null
          }
          if (item.type === "header") {
            return (
              <AreaHeader
                key={item.content.id}
                areaInfo={item.content}
                className={classNames(styles.taskItemGroupBackground, styles.homeCardShadow, {
                  [styles.taskItemGroupTopRound]: rounding.top.has(item.id),
                  [styles.taskItemGroupBottomRound]: rounding.bottom.has(item.id),
                })}
              />
            )
          } else {
            if (active?.id && active.id === item.headerId) {
              return null
            }
            return (
              <HomePageProjectItem
                key={item.content.id}
                projectInfo={item.content}
                className={classNames(styles.taskItemGroupBackground, {
                  [styles.taskItemGroupTopRound]: rounding.top.has(item.id),
                  [styles.taskItemGroupBottomRound]: rounding.bottom.has(item.id),
                })}
              />
            )
          }
        })}
      </div>
      <LastPlacement />
    </React.Fragment>
  )
}

export const MobileHome = () => {
  const navigationService = useService(INavigationService)
  const popupAction = usePopupAction()
  const todoService = useService(ITodoService)
  const thirdpartySyncService = useService(ISelfhostedSyncService)
  const navigate = useNavigate()
  useWatchEvent(todoService.onStateChange)
  useWatchEvent(thirdpartySyncService.onStateChange)
  const unstartedProjects = getFutureProjects(todoService.modelState, getTodayTimestampInUtc())
  const { value: config, setValue } = useConfig(toggleAreaConfigKey())
  const flattenedItemsResult = flattenRootCollections(todoService.modelState, {
    currentDate: getTodayTimestampInUtc(),
    colspanAreaList: config,
  })
  const sensors = useDragSensors()
  useScrollPosition("homeScrollPosition")
  const toast = useToast()

  const handleSync = async () => {
    if (thirdpartySyncService.hasServer && !thirdpartySyncService.syncing) {
      try {
        await thirdpartySyncService.sync()
        // toast success message
        toast({ message: localize("sync.success", "Sync successful") })
      } catch (error) {
        toast({ message: (error as Error).message })
      }
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return null
    const overId = over.id as string
    const activeId = active.id as string
    if (overId === DragDropElements.inbox) {
      navigationService.navigate({ path: "/create_task" })
      return
    }
    const res = getFlattenedItemsDragEndPosition(activeId, overId, flattenedItemsResult)
    if (res) {
      if (res.type === "createItem") {
        const id = todoService.addProject({
          title: "",
          position: res.position,
        })
        const position = res.position
        if (position.type === "firstElement" && position.parentId) {
          if (config.includes(position.parentId)) {
            setValue(config.filter((id) => id !== position.parentId))
          }
        }
        setTimeout(() => {
          todoService.editItem(id)
        }, 50)
      }
      if (res.type === "moveItem") {
        todoService.updateProject(res.activeId, {
          position: res.position,
        })
        const position = res.position
        if (position.type === "firstElement" && position.parentId) {
          if (config.includes(position.parentId)) {
            setValue(config.filter((id) => id !== position.parentId))
          }
        }
      }
      if (res.type === "moveHeader") {
        todoService.updateArea(res.activeId, {
          position: res.position,
        })
      }
    }
  }

  return (
    <PageLayout
      disableSticky
      header={{
        renderIcon: (className: string) => <House className={className} />,
        actions: [
          {
            icon: <SettingsIcon className={styles.headerActionButtonIcon} strokeWidth={1.5} />,
            onClick: () => navigate({ path: "/settings" }),
          },
          ...(thirdpartySyncService.showSyncIcon
            ? [
                {
                  icon: <SyncIcon className={thirdpartySyncService.syncing ? "animate-spin" : ""} />,
                  onClick: handleSync,
                },
              ]
            : []),
        ],
      }}
      onFabClick={() => {
        popupAction({
          groups: [
            {
              items: [
                {
                  icon: <CreateTaskMenuIcon />,
                  name: localize("create_popup.create_task", "Create Task"),
                  description: localize(
                    "create_popup.create_task_description",
                    "Capture an action to complete, then check it off when it is done.",
                  ),
                  onClick: () => {
                    navigationService.navigate({ path: "/create_task" })
                  },
                },
                {
                  icon: <CreateProjectMenuIcon />,
                  name: localize("create_popup.create_project", "Create Project"),
                  description: localize(
                    "create_popup.create_project_description",
                    "Define a goal, then complete its to-dos one by one.",
                  ),
                  onClick: () => {
                    const id = todoService.addProject({ title: "" })
                    todoService.editItem(id)
                  },
                },
                {
                  icon: <CreateAreaMenuIcon />,
                  name: localize("create_popup.create_area", "Create Area"),
                  description: localize(
                    "create_popup.create_area_description",
                    "Organize projects and to-dos by responsibility, such as Home or Work.",
                  ),
                  onClick: () => {
                    const id = todoService.addArea({ title: "" })
                    todoService.editItem(id)
                  },
                },
                {
                  icon: <CreateViewMenuIcon />,
                  name: localize("create_popup.create_view", "Create View"),
                  description: localize(
                    "create_popup.create_view_description",
                    "Bring related tasks together with filters in a focused view.",
                  ),
                  onClick: () => {
                    const uid = todoService.addView({ name: "", rule: "" })
                    navigationService.navigate({ path: `/views/${uid}` })
                  },
                },
              ],
            },
          ],
        })
      }}
      meta={
        <React.Fragment>
          <MobileHomeTopMenu></MobileHomeTopMenu>
          <MobileHomeViewsSection></MobileHomeViewsSection>
        </React.Fragment>
      }
      dragOption={{
        sortable: {
          items: flattenedItemsResult.flattenedItems.map((item): string => item.id),
        },
        overlayItem: {
          renderProject: (projectInfo) => <HomePageProjectOverlayItem projectInfo={projectInfo} />,
        },
        sensors,
        collisionDetection: getFlattenedItemsCollisionDetectionStrategy(flattenedItemsResult),
        onDragEnd: handleDragEnd,
      }}
    >
      <HomeProjectAndArea
        flattenedResult={flattenedItemsResult}
        unstartedProjects={unstartedProjects}
      ></HomeProjectAndArea>
      <InboxDropZone />
    </PageLayout>
  )
}
