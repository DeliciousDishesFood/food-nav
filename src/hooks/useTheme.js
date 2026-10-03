import { useEffect, useState } from 'react'
import { STORAGE_KEYS, readString, writeString } from '../utils/storage.js'

export const THEME_LIGHT = 'light'
export const THEME_DARK = 'dark'

function getInitialTheme() {
  const saved = readString(STORAGE_KEYS.theme, '')
  if (saved === THEME_DARK) return THEME_DARK
  if (saved === THEME_LIGHT) return THEME_LIGHT
  // 从未手动选择过：跟随系统主题（与 index.html 首屏脚本逻辑一致）
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? THEME_DARK
    : THEME_LIGHT
}

/**
 * 主题状态：写入 <html class="dark"> + localStorage，
 * 首屏闪烁由 index.html 里的内联脚本提前处理。
 */
export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === THEME_DARK)
    root.setAttribute('data-theme', theme)
    writeString(STORAGE_KEYS.theme, theme)
  }, [theme])

  const toggleTheme = () =>
    setTheme((current) => (current === THEME_DARK ? THEME_LIGHT : THEME_DARK))

  return { theme, setTheme, toggleTheme, isDark: theme === THEME_DARK }
}
