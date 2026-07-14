import { getTodayTimestampInUtc } from "@/core/time/getTodayTimestampInUtc"
import { areaPageTitleInputId, projectPageTitleInputId, viewPageTitleInputId } from "@/ui/components/edit/inputId"
import { PlusIcon, SearchIcon, SettingsIcon, SyncIcon } from "@/ui/components/icons"
import { FlattenedResult } from "@/core/state/home/flattenedItemsToResult"
import { flattenRootCollections } from "@/core/state/home/getFlattenRootCollections"
import { getFutureProjects } from "@/core/state/home/getFutureProjects"
import { AreaInfoState, ProjectInfoState } from "@/core/state/type"
import { DesktopMenuController } from "@/desktop/overlay/desktopMenu/DesktopMenuController"
import { useDesktopMessage } from "@/desktop/overlay/desktopMessage/useDesktopMessage.ts"
import { useService } from "@/ui/hooks/use-service"
import { useWatchEvent } from "@/ui/hooks/use-watch-event"
import { useConfig } from "@/ui/hooks/useConfig"
import { useDragSensors } from "@/ui/hooks/useDragSensors"
import { localize } from "@/nls"
import { toggleAreaConfigKey } from "@/services/config/config"
import { ISelfhostedSyncService } from "@/services/selfhostedSync/selfhostedSyncService.ts"
import { ITodoService } from "@/services/todo/todoService"
import { DragDropElements } from "@/core/dnd/dragDropCollision"
import { getFlattenedItemsCollisionDetectionStrategy } from "@/core/dnd/flattenedItemsCollisionDetectionStrategy"
import { getFlattenedItemsDragEndPosition } from "@/core/dnd/flattenedItemsDragPosition"
import { DndContext, DragEndEvent, useDndContext } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import classNames from "classnames"
import React from "react"
import { flushSync } from "react-dom"
import { Link, useNavigate } from "react-router"
import { IInstantiationService } from "@hamsterbase/foundation/instantiation"
import { desktopStyles } from "../../theme/main"
import { DragOverlayItem } from "../drag/DragOverlayItem"
import { CommandPaletteController } from "../../overlay/commandPalette/CommandPaletteController"
import { TestIds } from "@/testIds"
import { SidebarAreaItem } from "./SidebarAreaItem/SidebarAreaItem.tsx"
import { SidebarFutureProjectsItem } from "./SidebarFutureProjectsItem/SidebarFutureProjectsItem.tsx"
import { SidebarMenu } from "./SidebarMenu/SidebarMenu.tsx"
import { SidebarViewsSection } from "./SidebarViewsSection/SidebarViewsSection.tsx"
import { SidebarProjectItem as SidebarProjectItemComponent } from "./SidebarProjectItem/SidebarProjectItem.tsx"
import { MacTopBar } from "../MacTopBar.tsx"
import {
  CreateAreaMenuIcon,
  CreateProjectMenuIcon,
  CreateTaskMenuIcon,
  CreateViewMenuIcon,
} from "@/ui/components/icons/CreateMenuIcons.tsx"

interface SidebarProjectAndAreaProps {
  flattenedResult: FlattenedResult<AreaInfoState, ProjectInfoState>
  unstartedProjects: ProjectInfoState[]
}

const desktopMenuGap = 8

const SidebarProjectsAndAreas: React.FC<SidebarProjectAndAreaProps> = ({ flattenedResult, unstartedProjects }) => {
  const { active } = useDndContext()

  return (
    <div>
      {flattenedResult.flattenedItems.map((item) => {
        switch (item.type) {
          case "header":
            return <SidebarAreaItem key={item.id} areaInfo={item.content} />
          case "item": {
            if (item.headerId === active?.id && item.headerId) {
              return null
            }
            return <SidebarProjectItemComponent key={item.id} projectInfo={item.content} />
          }
          case "special": {
            if (item.id === DragDropElements.futureProjects) {
              return <SidebarFutureProjectsItem key={item.id} count={unstartedProjects.length} />
            }
            return null
          }
          default:
            return null
        }
      })}
    </div>
  )
}

export const SidebarContent: React.FC = () => {
  const todoService = useService(ITodoService)
  const instantiationService = useService(IInstantiationService)
  const selfhostedSyncService = useService(ISelfhostedSyncService)
  const navigate = useNavigate()
  useWatchEvent(todoService.onStateChange)
  useWatchEvent(selfhostedSyncService.onStateChange)
  const { value: config, setValue } = useConfig(toggleAreaConfigKey())
  const sensors = useDragSensors()
  const desktopMessage = useDesktopMessage()

  const handleSync = async () => {
    if (selfhostedSyncService.hasServer && !selfhostedSyncService.syncing) {
      try {
        await selfhostedSyncService.sync()
        desktopMessage({
          type: "success",
          message: localize("sync.sync_success", "Sync completed successfully."),
        })
      } catch (error) {
        desktopMessage({
          type: "error",
          message: (error as Error).message,
        })
      }
    }
  }

  const rootCollections = flattenRootCollections(todoService.modelState, {
    currentDate: getTodayTimestampInUtc(),
    colspanAreaList: config,
    disableCreate: true,
  })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return null
    const overId = over.id as string
    const activeId = active.id as string
    if (overId === DragDropElements.inbox) {
      return
    }
    const res = getFlattenedItemsDragEndPosition(activeId, overId, rootCollections)
    if (res) {
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

  const handleCreateMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    DesktopMenuController.create(
      {
        menuConfig: [
          {
            label: localize("create_popup.create_task", "Create Task"),
            description: localize(
              "create_popup.create_task_description",
              "Capture an action to complete, then check it off when it is done.",
            ),
            icon: <CreateTaskMenuIcon />,
            onSelect: () => {
              const taskId = flushSync(() => todoService.addTask({ title: "" }))
              navigate("/desktop/inbox", {
                state: { highlightTaskId: taskId },
              })
            },
          },
          {
            label: localize("create_popup.create_project", "Create Project"),
            description: localize(
              "create_popup.create_project_description",
              "Define a goal, then complete its to-dos one by one.",
            ),
            icon: <CreateProjectMenuIcon />,
            onSelect: () => {
              const projectId = flushSync(() => {
                return todoService.addProject({ title: "" })
              })

              if (projectId) {
                const projectUid = todoService.modelState.taskObjectMap.get(projectId)?.uid
                if (projectUid) {
                  navigate(`/desktop/project/${projectUid}`, {
                    state: {
                      focusInput: projectPageTitleInputId(projectId),
                    },
                  })
                }
              }
            },
          },
          {
            label: localize("create_popup.create_area", "Create Area"),
            description: localize(
              "create_popup.create_area_description",
              "Organize projects and to-dos by responsibility, such as Home or Work.",
            ),
            icon: <CreateAreaMenuIcon />,
            onSelect: () => {
              const areaId = flushSync(() => {
                return todoService.addArea({ title: "" })
              })

              if (areaId) {
                const areaUid = todoService.modelState.taskObjectMap.get(areaId)?.uid
                if (areaUid) {
                  navigate(`/desktop/area/${areaUid}`, {
                    state: {
                      focusInput: areaPageTitleInputId(areaId),
                    },
                  })
                }
              }
            },
          },
          {
            label: localize("create_popup.create_view", "Create View"),
            description: localize(
              "create_popup.create_view_description",
              "Bring related tasks together with filters in a focused view.",
            ),
            icon: <CreateViewMenuIcon />,
            onSelect: () => {
              const uid = flushSync(() => todoService.addView({ name: "", rule: "" }))
              if (uid) {
                navigate(`/desktop/views/${uid}`, {
                  state: { focusInput: viewPageTitleInputId(uid) },
                })
              }
            },
          },
        ],
        x: rect.left,
        y: rect.top - desktopMenuGap,
        placement: "top-start",
      },
      instantiationService,
    )
  }

  const futureProjects = getFutureProjects(todoService.modelState, getTodayTimestampInUtc())
  const sidebarProjectAreaListNoTopPadding =
    rootCollections.flattenedItems && rootCollections.flattenedItems[0]?.type === "header"

  return (
    <div className={classNames(desktopStyles.sidebarBackground, desktopStyles.sidebarContainerStyle)}>
      <MacTopBar />
      <SidebarMenu />
      <SidebarViewsSection />
      <div className={desktopStyles.SidebarProjectsHeader}>{localize("sidebar.projects.title", "Projects")}</div>
      <div
        className={classNames(desktopStyles.SidebarProjectAreaList, {
          [desktopStyles.SidebarProjectAreaListNoTopPadding]: sidebarProjectAreaListNoTopPadding,
        })}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={getFlattenedItemsCollisionDetectionStrategy(rootCollections)}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rootCollections.flattenedItems.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <SidebarProjectsAndAreas flattenedResult={rootCollections} unstartedProjects={futureProjects} />
          </SortableContext>
          <DragOverlayItem />
        </DndContext>
      </div>
      <div className={desktopStyles.SidebarBottomBar}>
        <button
          type="button"
          onClick={handleCreateMenu}
          className={desktopStyles.SidebarBottomCreateButton}
          data-test-id={TestIds.Sidebar.CreateMenuButton}
        >
          <PlusIcon className={desktopStyles.SidebarBottomCreateIcon} />
          <span className={desktopStyles.SidebarBottomCreateLabel}>
            {localize("sidebar.create_menu", "Create New")}
          </span>
        </button>
        <div className={desktopStyles.SidebarBottomActions}>
          {selfhostedSyncService.showSyncIcon && (
            <button
              type="button"
              onClick={handleSync}
              className={desktopStyles.SidebarBottomIconButton}
              aria-label={localize("sync.title", "Sync")}
            >
              <SyncIcon
                className={`${desktopStyles.SidebarBottomIcon} ${selfhostedSyncService.syncing ? "animate-spin" : ""}`}
              />
            </button>
          )}
          <button
            type="button"
            data-test-id={TestIds.CommandPalette.SidebarTrigger}
            onClick={() => CommandPaletteController.create(instantiationService)}
            className={desktopStyles.SidebarBottomIconButton}
            aria-label={localize("search.title", "Search")}
          >
            <SearchIcon className={desktopStyles.SidebarBottomIcon} />
          </button>
          <Link
            to="/desktop/settings"
            className={desktopStyles.SidebarBottomIconButton}
            aria-label={localize("settings.title", "Settings")}
          >
            <SettingsIcon className={desktopStyles.SidebarBottomIcon} />
          </Link>
        </div>
      </div>
    </div>
  )
}
