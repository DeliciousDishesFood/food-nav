/** 统一的 localStorage 读写（隐私模式 / 配额异常时静默降级，绝不抛错） */

export const STORAGE_KEYS = {
  theme: 'food-nav:theme',
  category: 'food-nav:category',
  favorites: 'food-nav:favorites',
}

function safeGet(key) {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key, value) {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, value)
  } catch {
    /* 隐私模式 / 存储配额：忽略，功能降级为会话内状态 */
  }
}

export function readString(key, fallback = '') {
  const value = safeGet(key)
  return value === null ? fallback : value
}

export function writeString(key, value) {
  safeSet(key, value)
}

/** 读取字符串数组（只保留字符串项，坏数据直接丢弃） */
export function readList(key) {
  try {
    const raw = safeGet(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => typeof item === 'string')
  } catch {
    return []
  }
}

export function writeList(key, list) {
  safeSet(key, JSON.stringify(list))
}
