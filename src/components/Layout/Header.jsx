import { useEffect, useState } from 'react'
import { MorphIcon } from 'morphicons/react'
import SearchBar from '../SearchBar.jsx'
import ThemeToggle from '../ThemeToggle.jsx'
import TypeWriterQuote from '../TypeWriterQuote.tsx'
import { Flame, Sparkles } from '../../icons/registry.js'

export default function Header({ value, onChange }) {
  const [logoIcon, setLogoIcon] = useState(Flame)
  const [isGlass, setIsGlass] = useState(false)

  // 向下滚动时导航栏加毛玻璃，向上滚动恢复原状
  useEffect(() => {
    let lastY = window.scrollY
    let frame = 0

    const update = () => {
      frame = 0
      const currentY = window.scrollY
      if (currentY > lastY + 4 && currentY > 60) {
        setIsGlass(true)
      } else if (currentY < lastY - 4) {
        setIsGlass(false)
      }
      lastY = currentY
    }

    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <header className="sticky top-4 z-20">
      <div
        className={`relative flex flex-col gap-3 border-2 border-food-line px-5 py-4 shadow-foodHeader transition-all duration-300 ease-out sm:px-7 ${
          isGlass
            ? 'rounded-[20px] bg-white/70 backdrop-blur-md dark:bg-[#241A33]/75'
            : 'rounded-[28px] bg-gradient-to-br from-food-surface via-food-surface-2 to-food-surface-3'
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <a
            href="#/"
            className="flex shrink-0 items-center gap-3"
            onMouseEnter={() => setLogoIcon(Sparkles)}
            onMouseLeave={() => setLogoIcon(Flame)}
          >
            <span className="flex h-12 w-12 -rotate-6 items-center justify-center rounded-full bg-gradient-to-br from-[#FF8FB8] to-food-primary text-white shadow-foodSticker ring-4 ring-food-line">
              <MorphIcon icon={logoIcon} size={26} strokeWidth={2.2} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="relative inline-block w-fit text-page-title font-display text-food-dark">
                <span className="absolute inset-x-0 bottom-1 h-2 rounded-full bg-food-accent-soft" />
                <span className="relative">食光导航</span>
              </span>
              <span className="mt-1 text-xs text-food-muted">
                ✨ 美食灵感整理站 ✨
              </span>
            </span>
          </a>

          <span className="w-full min-w-0 sm:ml-auto sm:max-w-md">
            <SearchBar value={value} onChange={onChange} />
          </span>

          {/* 主题开关：移动端固定在卡片右上角，桌面端同行右侧 */}
          <ThemeToggle className="absolute right-3 top-3 z-10 sm:static sm:shrink-0" />
        </div>

        {/* 打字机暖心句子：搜索框下方独立一行，桌面/移动端统一居中 */}
        <TypeWriterQuote />
      </div>
    </header>
  )
}
