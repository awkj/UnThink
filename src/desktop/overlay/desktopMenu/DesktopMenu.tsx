import type {
  DesktopMenuController,
  DesktopMenuStatusSnapshot,
  IMenuConfig,
  IMenuSubmenuConfig,
} from "@/desktop/overlay/desktopMenu/DesktopMenuController.ts"
import { desktopStyles } from "@/desktop/theme/main"
import { useWorkbenchOverlay } from "@/ui/hooks/useWorkbenchOverlay"
import { OverlayEnum } from "@/services/overlay/overlayEnum"
import { TestIds } from "@/testIds"
import React, { useCallback, useEffect, useRef, useSyncExternalStore } from "react"
import { DesktopMenuItemComponent } from "./DesktopMenuItemComponent"
import { DesktopSubmenuComponent } from "./DesktopSubmenuComponent"
import "./commands"
import { calculateElementHeight, calculateElementWidth } from "../datePicker/constant"

interface IDesktopMenuContentProps {
  controller: DesktopMenuController
}

function useDesktopMenuStatus(controller: DesktopMenuController): DesktopMenuStatusSnapshot {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const disposable = controller.onStatusChange(onStoreChange)
      return () => disposable.dispose()
    },
    [controller],
  )
  const getSnapshot = useCallback(() => controller.statusSnapshot, [controller])

  return useSyncExternalStore(subscribe, getSnapshot)
}

const DesktopMenuContent: React.FC<IDesktopMenuContentProps> = ({ controller }) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const status = useDesktopMenuStatus(controller)
  const hasDescriptions = controller.hasDescriptions
  const menuItemHeight = calculateElementHeight(
    hasDescriptions ? desktopStyles.DesktopMenuItemRichBase : desktopStyles.DesktopMenuItemBase,
  )
  const defaultMenuWidth = calculateElementWidth(
    hasDescriptions ? desktopStyles.DesktopMenuRichContainer : desktopStyles.DesktopMenuContainer,
  )
  const dividerHeight = calculateElementHeight(desktopStyles.DesktopMenuDivider)
  const menuPadding = 4
  const menuBorder = 2
  const menuWidth = controller.menuWidth ?? defaultMenuWidth
  const submenuWidth = controller.submenuWidth ?? defaultMenuWidth
  const menuHeight =
    controller.menuConfig.length * menuItemHeight +
    controller.menuConfig.filter((item) => item.dividerAbove).length * dividerHeight +
    menuPadding * 2 +
    menuBorder
  const menuStyle = controller.getMenuStyle({
    menuItemHeight,
    menuWidth,
    menuHeight,
  })
  const submenuStyle =
    status.activeIndex !== null && status.activeMenu?.submenu && status.isSubmenuOpen
      ? controller.getSubmenuStyle({
          status,
          menuItemHeight,
          menuWidth,
          menuHeight,
          submenuWidth,
        })
      : null
  const submenuItemCount = status.activeMenu?.submenu
    ? status.activeMenu.submenu.reduce((acc, group) => acc + group.length, 0)
    : 0
  const submenuHeight =
    submenuItemCount * menuItemHeight +
    Math.max(0, (status.activeMenu?.submenu?.length ?? 0) - 1) * dividerHeight +
    menuPadding * 2 +
    menuBorder
  const wrapperLeft = submenuStyle
    ? Math.min(menuStyle.left as number, submenuStyle.left as number)
    : (menuStyle.left as number)
  const wrapperTop = submenuStyle
    ? Math.min(menuStyle.top as number, submenuStyle.top as number)
    : (menuStyle.top as number)
  const wrapperRight = Math.max(
    (menuStyle.left as number) + menuWidth,
    submenuStyle ? (submenuStyle.left as number) + submenuWidth : -Infinity,
  )
  const wrapperBottom = Math.max(
    (menuStyle.top as number) + menuHeight,
    submenuStyle ? (submenuStyle.top as number) + submenuHeight : -Infinity,
  )
  const popupStyle: React.CSSProperties = {
    position: "fixed",
    left: wrapperLeft,
    top: wrapperTop,
    width: wrapperRight - wrapperLeft,
    height: wrapperBottom - wrapperTop,
    zIndex: controller.zIndex,
  }
  const popupMenuStyle: React.CSSProperties = {
    ...menuStyle,
    position: "absolute",
    left: (menuStyle.left as number) - wrapperLeft,
    top: (menuStyle.top as number) - wrapperTop,
  }
  const popupSubmenuStyle: React.CSSProperties | undefined = submenuStyle
    ? {
        ...submenuStyle,
        position: "absolute",
        left: (submenuStyle.left as number) - wrapperLeft,
        top: (submenuStyle.top as number) - wrapperTop,
      }
    : undefined

  // 在组件挂载时设置焦点
  useEffect(() => {
    if (menuRef.current) {
      menuRef.current.focus()
    }
  }, [])

  const handleItemClick = useCallback(
    (item: IMenuConfig | IMenuSubmenuConfig) => {
      controller.handleItemClick(item)
    },
    [controller],
  )

  const handleBackdropClick = useCallback(() => {
    controller.dispose()
  }, [controller])

  return (
    <>
      <div
        className={desktopStyles.DesktopMenuBackdrop}
        style={{ zIndex: controller.zIndex - 1 }}
        onClick={handleBackdropClick}
        data-test-id={TestIds.DesktopMenu.Backdrop}
      />

      <div style={popupStyle} data-test-id={TestIds.DesktopMenu.Popup}>
        <div
          ref={menuRef}
          className={hasDescriptions ? desktopStyles.DesktopMenuRichContainer : desktopStyles.DesktopMenuContainer}
          style={popupMenuStyle}
          tabIndex={0}
          data-test-id={TestIds.DesktopMenu.Container}
        >
          <div className={hasDescriptions ? desktopStyles.DesktopMenuRichContent : desktopStyles.DesktopMenuContent}>
            {controller.menuConfig.map((item, index) => (
              <React.Fragment key={index}>
                {item.dividerAbove && <div className={desktopStyles.DesktopMenuDivider} />}
                <DesktopMenuItemComponent
                  item={item}
                  onItemClick={handleItemClick}
                  onMouseEnter={() => controller.setActiveIndex(index)}
                  isActive={status.activeIndex === index}
                  showCheckmarks={controller.showCheckmarks}
                />
              </React.Fragment>
            ))}
          </div>
        </div>
        {status.activeIndex !== null && status.activeMenu?.submenu && status.isSubmenuOpen && popupSubmenuStyle && (
          <DesktopSubmenuComponent
            submenu={status.activeMenu.submenu}
            style={popupSubmenuStyle}
            onItemClick={handleItemClick}
            activeSubmenuIndex={status.activeSubmenuIndex}
            onMouseEnter={(index) => controller.setActiveSubmenuIndex(index)}
            showCheckmarks={status.activeMenu.submenu.some((group) => group.some((item) => item.checked !== undefined))}
          />
        )}
      </div>
    </>
  )
}

export const DesktopMenu: React.FC = () => {
  const controller = useWorkbenchOverlay<DesktopMenuController>(OverlayEnum.desktopMenu)
  if (!controller || !controller.menuConfig) return null
  return <DesktopMenuContent controller={controller} />
}
