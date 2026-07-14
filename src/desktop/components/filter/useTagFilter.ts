import { useState } from "react"
import { TAG_FILTER_ALL, TagFilter } from "./tagFilter"

export function useTagFilter(allTags: string[]) {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [selectedTag, selectTag] = useState<TagFilter>(TAG_FILTER_ALL)
  const currentTag = selectedTag.type === "tag" && !allTags.includes(selectedTag.value) ? TAG_FILTER_ALL : selectedTag

  const clickFilter = () => {
    setIsFilterOpen((value) => !value)
  }

  return {
    selectTag,
    clickFilter,
    isFilterOpen,
    currentTag,
    tags: allTags,
  }
}
