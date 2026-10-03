import { useSyncExternalStore } from 'react'
import { STORAGE_KEYS, readList, writeList } from '../utils/storage.js'

/** 模块级收藏状态：任意组件（卡片爱心 / 分类标签 / 筛选逻辑）共享同一份数据 */
let favorites = readList(STORAGE_KEYS.favorites)
const listeners = new Set()

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit() {
  for (const listener of listeners) listener()
}

export function isFavorite(name) {
  return favorites.includes(name)
}

export function toggleFavorite(name) {
  favorites = favorites.includes(name)
    ? favorites.filter((item) => item !== name)
    : [...favorites, name]
  writeList(STORAGE_KEYS.favorites, favorites)
  emit()
}

/** 返回当前收藏列表快照（引用稳定，仅在变更时更新） */
export function useFavorites() {
  return useSyncExternalStore(subscribe, () => favorites, () => favorites)
}
