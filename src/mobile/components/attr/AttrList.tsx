import React from "react"
import { AttrLabel, AttrLabelValue } from "./AttrLabel"
import { AttrLabelListItem, AttrLabelListProps } from "./AttrLabelList"
import { AttrLabelList } from "./AttrLabelList"
import { AttrTags } from "./AttrTags"
import { AttrTasks } from "./AttrTasks"
import { AttrTextArea } from "./AttrTextArea"

type AttrRowTextArea = {
  type: "textArea"
  key: string
  icon: React.ReactNode
  content: string
  onChange: (v: string) => void
  placeholder: string
  testId?: string
}

type AttrRowLabel = {
  type: "label"
  key: string
  icon: React.ReactNode
  placeholder: string
  value?: AttrLabelValue | undefined
  onClick?: (() => void) | undefined
  onClear?: (() => void) | undefined
  testId?: string | undefined
  labelTitleColor?: string | undefined
}

type AttrRowLabelListInteractive = {
  hidden?: boolean | undefined
  type: "interactive"
  key: string
  icon: React.ReactNode
  placeholder: string
  items: AttrLabelListItem[]
  onLabelClick?: ((index: number) => void) | undefined
  onRemove?: ((index: number) => void) | undefined
  addButtonLabel?: string | undefined
  onAdd: () => void
  testId?: string | undefined
}

type AttrRowTags = {
  type: "tags"
  key: string
  icon: React.ReactNode
  placeholder: string
  tags: string[]
  onClick?: (() => void) | undefined
  testId?: string | undefined
}

type AttrRowTasks = {
  type: "tasks"
  key: string
  icon: React.ReactNode
  children: React.ReactNode
  totalCount?: number | undefined
  completedCount?: number | undefined
  addButtonLabel?: string | undefined
  onAdd?: (() => void) | undefined
  testId?: string | undefined
  addButtonTestId?: string | undefined
}

export type AttrRowItem = AttrRowTextArea | AttrRowLabel | AttrRowLabelListInteractive | AttrRowTags | AttrRowTasks

function renderAttrRow(item: AttrRowItem): React.ReactNode {
  switch (item.type) {
    case "textArea":
      return (
        <AttrTextArea
          key={item.key}
          icon={item.icon}
          content={item.content}
          onChange={item.onChange}
          placeholder={item.placeholder}
        />
      )
    case "label":
      return (
        <AttrLabel
          key={item.key}
          icon={item.icon}
          placeholder={item.placeholder}
          value={item.value}
          onClick={item.onClick}
          onClear={item.onClear}
          testId={item.testId}
          labelTitleColor={item.labelTitleColor}
        />
      )
    case "interactive": {
      if (item.hidden) {
        return null
      }
      const { key, ...labelListProps } = item
      return <AttrLabelList key={key} {...(labelListProps as AttrLabelListProps)} />
    }
    case "tags":
      return (
        <AttrTags
          key={item.key}
          icon={item.icon}
          placeholder={item.placeholder}
          tags={item.tags}
          onClick={item.onClick}
          testId={item.testId}
        />
      )
    case "tasks":
      return (
        <AttrTasks
          key={item.key}
          icon={item.icon}
          totalCount={item.totalCount}
          completedCount={item.completedCount}
          addButtonLabel={item.addButtonLabel}
          onAdd={item.onAdd}
          testId={item.testId}
          addButtonTestId={item.addButtonTestId}
        >
          {item.children}
        </AttrTasks>
      )
  }
}

interface AttrListProps {
  items: AttrRowItem[]
}

export const AttrList: React.FC<AttrListProps> = ({ items }) => {
  return <>{items.map(renderAttrRow)}</>
}
