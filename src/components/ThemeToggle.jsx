import { MorphIcon } from 'morphicons/react'
import { useTheme } from '../hooks/useTheme.js'
import { Moon, Sun } from '../icons/registry.js'

/** 樱花粉亮色 / 暗系紫黑贴纸 切换开关（右上角） */
export default function ThemeToggle({ className = '' }) {
  const { isDark, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? '切换到樱花粉亮色主题' : '切换到暗系紫黑主题'}
      title={isDark ? '切换到樱花粉亮色主题' : '切换到暗系紫黑主题'}
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-food-line bg-food-surface text-food-primary shadow-foodSticker transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:shadow-foodFocus ${className}`}
    >
      <MorphIcon
        icon={isDark ? Sun : Moon}
        size={20}
        strokeWidth={2.2}
        aria-hidden="true"
      />
    </button>
  )
}
