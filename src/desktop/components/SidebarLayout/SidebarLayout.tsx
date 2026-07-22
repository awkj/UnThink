import { SidebarContent } from "@/desktop/components/sidebar/SidebarContent"
import { desktopStyles } from "@/desktop/theme/main"
import { useConfig } from "@/ui/hooks/useConfig"
import { mainSidebarWidthConfigKey } from "@/services/config/config"
import { Allotment, LayoutPriority } from "allotment"
import classNames from "classnames"
import React from "react"
import { Outlet } from "react-router"
import { calculateElementWidth } from "../../overlay/datePicker/constant"

export const SidebarLayout: React.FC = () => {
  const mainSidebarConfig = useConfig(mainSidebarWidthConfigKey())
  const isSidebarCollapsed = mainSidebarConfig.value[0] === 0

  return (
    <div className={desktopStyles.SidebarLayoutContainer}>
      <Allotment
        {...(mainSidebarConfig.value.length === 2 ? { defaultSizes: mainSidebarConfig.value } : {})}
        onChange={mainSidebarConfig.saveIfValid}
        proportionalLayout={false}
      >
        <Allotment.Pane
          minSize={calculateElementWidth(desktopStyles.SidebarMinWidth)}
          maxSize={calculateElementWidth(desktopStyles.SidebarMaxWidth)}
          snap
          preferredSize={calculateElementWidth(desktopStyles.SidebarPreferredWidth)}
        >
          <SidebarContent />
        </Allotment.Pane>
        <Allotment.Pane
          priority={LayoutPriority.High}
          className={classNames(desktopStyles.SidebarLayoutPaneWrapper, {
            [desktopStyles.SidebarLayoutContentCollapsedPadding]: isSidebarCollapsed,
          })}
        >
          <div className={desktopStyles.SidebarLayoutContent}>
            <Outlet />
          </div>
        </Allotment.Pane>
      </Allotment>
    </div>
  )
}
