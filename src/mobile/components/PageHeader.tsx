import { LeftIcon } from "@/ui/components/icons"
import { useBack } from "@/ui/hooks/useBack"
import { useCancelEdit } from "@/ui/hooks/useCancelEdit"
import { MobileTestIds } from "@/mobile/testids"
import classNames from "classnames"
import React, { useRef } from "react"
import { styles } from "../theme"

export interface HeaderAction {
  icon: React.ReactNode
  onClick: () => void
  testId?: string
  isActive?: boolean
}

export interface PageHeaderProps {
  title?: string | undefined
  headerPlaceholder?: string | undefined
  id?: string | undefined
  icon?: React.ReactNode | undefined
  renderIcon?: ((className: string) => React.ReactNode) | undefined
  actions?: HeaderAction[] | undefined
  showBack?: boolean | undefined
  onSave?: ((title: string) => void) | undefined
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, id, actions, showBack }) => {
  const back = useBack()
  const headerContainerRef = useRef<HTMLDivElement>(null)
  const { itemClassName, shouldIgnoreClick } = useCancelEdit(headerContainerRef, id ?? "")

  const headerContainerStyle = classNames(styles.headerBackground, styles.headerRoot, itemClassName)

  return (
    <div
      className={headerContainerStyle}
      ref={headerContainerRef}
      onClick={shouldIgnoreClick}
      data-testid={MobileTestIds.PageHeader.Root}
    >
      {showBack && (
        <div className={styles.headerLeftContainer}>
          <button onClick={back} className={classNames(styles.headerActionButton, styles.headerActionButtonNormal)}>
            <LeftIcon className={styles.headerActionButtonIcon} strokeWidth={1.5} />
          </button>
        </div>
      )}

      {title && <h1 className={styles.headerTitle}>{title}</h1>}

      {actions && actions.length > 0 && (
        <div className={styles.headerRightContainer}>
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              className={classNames(
                styles.headerActionButton,
                action.isActive ? styles.headerActionButtonActive : styles.headerActionButtonNormal,
              )}
              data-test-id={action.testId}
            >
              <div className={styles.headerActionButtonIcon}>{action.icon}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
