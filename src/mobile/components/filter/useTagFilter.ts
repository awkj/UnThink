import { useState } from "react"
import { TAG_FILTER_ALL, TagFilter } from "./tagFilter"

export function useTagFilter(allTags: string[]) {
  const [selectedTag, selectTag] = useState<TagFilter>(TAG_FILTER_ALL)
  const currentTag = selectedTag.type === "tag" && !allTags.includes(selectedTag.value) ? TAG_FILTER_ALL : selectedTag

  return {
    selectTag,
    currentTag,
    tags: allTags,
  }
}
