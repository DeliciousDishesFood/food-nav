import { useEffect, useMemo, useState } from 'react'
import { navSource, getCategoryList } from '../data/navSources.js'
import { useFavorites } from './useFavorites.js'
import { STORAGE_KEYS, readString, writeString } from '../utils/storage.js'

/** 虚拟分类：只展示收藏卡片 */
export const FAVORITES_CATEGORY = 'favorites'
const DEFAULT_CATEGORY = 'all'

/** localStorage 里存的分类可能是旧值 / 被篡改，先校验再用 */
function normalizeCategory(key) {
  const valid =
    key === FAVORITES_CATEGORY ||
    getCategoryList().some((tab) => tab.key === key)
  return valid ? key : DEFAULT_CATEGORY
}

export function useFilterNav() {
  const [searchText, setSearchText] = useState('')
  // 分类标签记忆：刷新后自动恢复上次选中的分类
  const [activeCategoryKey, setActiveCategoryKey] = useState(() =>
    normalizeCategory(readString(STORAGE_KEYS.category, DEFAULT_CATEGORY)),
  )
  const favorites = useFavorites()

  useEffect(() => {
    writeString(STORAGE_KEYS.category, activeCategoryKey)
  }, [activeCategoryKey])

  const filteredNavList = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()

    return navSource
      .map((group) => {
        let items = group.items

        if (activeCategoryKey === FAVORITES_CATEGORY) {
          items = items.filter((item) => favorites.includes(item.name))
        } else if (
          activeCategoryKey !== DEFAULT_CATEGORY &&
          group.categoryKey !== activeCategoryKey
        ) {
          return null
        }

        // 本地模糊搜索：标题 + 描述实时匹配
        if (keyword) {
          items = items.filter((item) => {
            const haystack = `${item.name} ${item.desc}`.toLowerCase()
            return haystack.includes(keyword)
          })
        }

        return items.length > 0 ? { ...group, items } : null
      })
      .filter(Boolean)
  }, [searchText, activeCategoryKey, favorites])

  return {
    searchText,
    setSearchText,
    activeCategoryKey,
    setActiveCategoryKey,
    filteredNavList,
  }
}
