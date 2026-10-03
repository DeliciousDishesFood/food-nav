import { MorphIcon } from 'morphicons/react'
import { getIconNode } from '../icons/registry.js'

export default function CategoryTabs({ tabs, activeKey, onChange }) {
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2 pt-1">
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={
              isActive
                ? 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-food-line bg-food-primary px-5 py-2 font-rounded text-control font-bold text-white shadow-foodTab transition-all duration-200 hover:-translate-y-0.5'
                : 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-food-line bg-food-surface px-5 py-2 font-rounded text-control font-medium text-food-dark shadow-foodSticker transition-all duration-200 hover:-translate-y-0.5 hover:text-food-primary'
            }
          >
            {tab.icon ? (
              <MorphIcon
                icon={getIconNode(tab.icon)}
                size={16}
                strokeWidth={2.2}
                aria-hidden="true"
              />
            ) : null}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
