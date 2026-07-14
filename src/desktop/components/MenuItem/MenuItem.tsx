import classNames from "classnames"
import React from "react"
import { Link, useLocation } from "react-router"
import { desktopStyles } from "../../theme/main"

export interface MenuItemProps {
  to: string
  text: string
  icon: React.ReactNode
  className?: string | undefined
  primaryBadge?: number | undefined
  secondaryBadge?: number | undefined
}

export const MenuItem: React.FC<MenuItemProps> = ({ to, text, icon, className, primaryBadge, secondaryBadge }) => {
  const location = useLocation()
  const isActive = location.pathname.startsWith(to)
  const iconNode = React.isValidElement<{ className?: string }>(icon)
    ? React.cloneElement(icon, {
        className: classNames(desktopStyles.SidebarMenuItemIconSvg, icon.props.className),
      })
    : icon

  return (
    <li className={className}>
      <Link
        to={to}
        className={classNames(desktopStyles.SidebarMenuItem, {
          [desktopStyles.SidebarMenuItemActive]: isActive,
          [desktopStyles.SidebarMenuItemInactive]: !isActive,
        })}
      >
        <div className={desktopStyles.SidebarMenuItemIcon}>{iconNode}</div>
        <div className={desktopStyles.SidebarMenuItemLabel}>{text}</div>
        {primaryBadge !== undefined && primaryBadge > 0 && (
          <span className={desktopStyles.SidebarMenuItemBadgePrimary}>{primaryBadge}</span>
        )}
        {secondaryBadge !== undefined && secondaryBadge > 0 && (
          <span className={desktopStyles.SidebarMenuItemBadgeSecondary}>{secondaryBadge}</span>
        )}
      </Link>
    </li>
  )
}
