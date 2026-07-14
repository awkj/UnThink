import React from "react"
import { styles } from "../../theme"
import { AttrContainer } from "./AttrContainer"

interface AttrTasksProps {
  icon: React.ReactNode
  children: React.ReactNode
  totalCount?: number | undefined
  completedCount?: number | undefined
  addButtonLabel?: string | undefined
  onAdd?: (() => void) | undefined
  testId?: string | undefined
  addButtonTestId?: string | undefined
}

export const AttrTasks: React.FC<AttrTasksProps> = ({
  icon,
  children,
  totalCount = 0,
  completedCount = 0,
  addButtonLabel,
  onAdd,
  testId,
  addButtonTestId,
}) => {
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  return (
    <AttrContainer icon={icon} testId={testId}>
      <div className={styles.createTaskSubtaskList}>
        {totalCount > 0 && (
          <div className={styles.createTaskSubtaskHeader}>
            <span>
              {completedCount} / {totalCount}
            </span>
            <div className={styles.createTaskSubtaskProgressBar}>
              <div className={styles.createTaskSubtaskProgressFill} style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        {children}
        {addButtonLabel && onAdd && (
          <span className={styles.createTaskAddButton} onClick={onAdd} data-testid={addButtonTestId}>
            {addButtonLabel}
          </span>
        )}
      </div>
    </AttrContainer>
  )
}
