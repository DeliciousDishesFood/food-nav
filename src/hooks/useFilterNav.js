import { useEffect, useMemo, useState } from 'react'
import { navSource } from '../data/navSources.js'
import { useFavorites } from './useFavorites.js'
import { STORAGE_KEYS, readString, writeString } from '../utils/storage.js'

/** 虚拟分类：只展示收藏卡片 */
export const FAVORITES_CATEGORY = 'favorites'
const DEFAULT_CATEGORY = 'all'

/**
 * 校验选中分类是否仍然存在（M2 起数据源为后端分类，管理员删分类后 key 会失效）
 * 校验集合：navList 的 categoryKey（外加虚拟的 all / favorites）
 */
function normalizeCategory(key, navList) {
  const valid =
    key === DEFAULT_CATEGORY ||
    key === FAVORITES_CATEGORY ||
    navList.some((group) => group.categoryKey === key)
  return valid ? key : DEFAULT_CATEGORY
}

/**
 * 导航筛选 hook（搜索 / 分类 / 收藏过滤）
 * @param {Array} [navList] 外部数据源（M1：后端 API 归一化结果）；缺省用 navSources 本地快照
 */
export function useFilterNav(navList = navSource) {
  const [searchText, setSearchText] = useState('')
  // 分类标签记忆：刷新后自动恢复上次选中的分类
  const [storedCategoryKey, setStoredCategoryKey] = useState(() =>
    normalizeCategory(readString(STORAGE_KEYS.category, DEFAULT_CATEGORY), navList),
  )
  const favorites = useFavorites()

  // 数据更新（管理员删分类）后失效 key 自动回落「全部」——派生值，无需 effect：
  // normalizeCategory 会把不在 navList 中的 key 映射为 all，随 navList 变化即时生效
  const activeCategoryKey = normalizeCategory(storedCategoryKey, navList)

  useEffect(() => {
    writeString(STORAGE_KEYS.category, activeCategoryKey)
  }, [activeCategoryKey])

  const filteredNavList = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()

    return navList
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
  }, [searchText, activeCategoryKey, favorites, navList])

  return {
    searchText,
    setSearchText,
    activeCategoryKey,
    setActiveCategoryKey: setStoredCategoryKey,
    filteredNavList,
  }
}
