import { desktopStyles } from "@/desktop/theme/main"
import { localize } from "@/nls"
import { AIIcon, CircleQuestionMark, DownloadIcon, PaletteIcon, Server } from "@/ui/components/icons"
import classNames from "classnames"
import React from "react"
import { Link, useLocation } from "react-router"

const groups = [
  {
    id: "general",
    label: localize("settings.sidebar.general"),
    items: [
      {
        id: "appearance",
        label: localize("settings.appearance"),
        path: "/settings/appearance",
        icon: PaletteIcon,
      },
      {
        id: "ai",
        label: localize("settings.ai"),
        path: "/settings/ai",
        icon: AIIcon,
      },
    ],
  },
  {
    id: "data",
    label: localize("settings.sidebar.data"),
    items: [
      {
        id: "selfhosted-sync",
        label: localize("sync.serverSettings"),
        path: "/settings/selfhosted-sync",
        icon: Server,
      },
      {
        id: "import-export",
        label: localize("settings.import_export"),
        path: "/settings/import-export",
        icon: DownloadIcon,
      },
    ],
  },
] as const

const guide = {
  label: localize("guide.title"),
  path: "/settings/guide",
  icon: CircleQuestionMark,
} as const

export const SettingsNavigation: React.FC = () => {
  const location = useLocation()

  const renderLink = (item: {
    label: string
    path: string
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  }) => {
    const isActive = location.pathname === item.path
    const Icon = item.icon

    return (
      <Link
        key={item.path}
        to={item.path}
        replace
        state={location.state}
        aria-current={isActive ? "page" : undefined}
        className={classNames(
          desktopStyles.SettingsNavigationItem,
          isActive ? desktopStyles.SettingsNavigationItemActive : desktopStyles.SettingsNavigationItemInactive,
        )}
      >
        <span className={desktopStyles.SettingsNavigationIconContainer}>
          <Icon className={desktopStyles.SettingsNavigationIcon} strokeWidth={1.5} />
        </span>
        <span className={desktopStyles.SettingsNavigationLabel}>{item.label}</span>
      </Link>
    )
  }

  return (
    <nav className={desktopStyles.SettingsNavigation} aria-label={localize("settings.title")}>
      <h1 id="settings-modal-title" className={desktopStyles.SettingsNavigationTitle}>
        {localize("settings.title")}
      </h1>
      <div className={desktopStyles.SettingsNavigationGroups}>
        {groups.map((group) => (
          <div key={group.id} className={desktopStyles.SettingsNavigationGroup}>
            <span className={desktopStyles.SettingsNavigationGroupLabel}>{group.label}</span>
            <div className={desktopStyles.SettingsNavigationGroupItems}>{group.items.map(renderLink)}</div>
          </div>
        ))}
      </div>
      <div className={desktopStyles.SettingsNavigationFooter}>{renderLink(guide)}</div>
    </nav>
  )
}
