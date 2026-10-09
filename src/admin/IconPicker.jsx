import { MorphIcon } from 'morphicons/react'
import { iconRegistry } from '../icons/registry.js'

/**
 * 图标选择器：网格展示 src/icons/registry.js 的全部图标名
 * （本文件是 admin 与主站唯一共享引用：只读图标名清单，不 import 主站组件/hooks）
 */
export default function IconPicker({ value, onChange }) {
  const names = Object.keys(iconRegistry)

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-12">
        {names.map((name) => {
          const active = value === name
          return (
            <button
              key={name}
              type="button"
              title={name}
              aria-label={`选择图标 ${name}`}
              aria-pressed={active}
              onClick={() => onChange(name)}
              className={
                active
                  ? 'flex h-10 items-center justify-center rounded-2xl border-2 border-food-line bg-food-primary text-white shadow-foodTab'
                  : 'flex h-10 items-center justify-center rounded-2xl border-2 border-food-line bg-food-tagBg text-food-muted shadow-foodSticker transition-all duration-200 hover:-translate-y-0.5 hover:text-food-primary'
              }
            >
              <MorphIcon icon={iconRegistry[name]} size={18} strokeWidth={2.2} />
            </button>
          )
        })}
      </div>
      <p className="text-xs text-food-muted">
        当前图标：
        <span className="font-bold text-food-dark">{value || '未选择'}</span>
        （共 {names.length} 个可选）
      </p>
    </div>
  )
}
