import { useState } from 'react'
import AdminDashboard from './AdminDashboard.jsx'
import AdminSites from './AdminSites.jsx'
import AdminCategories from './AdminCategories.jsx'
import AdminChecks from './AdminChecks.jsx'
import AdminStats from './AdminStats.jsx'

const TABS = [
  { key: 'dashboard', label: '仪表盘' },
  { key: 'sites', label: '站点管理' },
  { key: 'categories', label: '分类管理' },
  { key: 'checks', label: '检测中心' },
  { key: 'stats', label: '访问统计' },
]

/** 面板外壳：顶栏（食光管理台 + 登出）+ 内部 Tab */
export default function AdminShell({ onLogout }) {
  const [tab, setTab] = useState('dashboard')

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b-2 border-food-line bg-food-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="text-food-sun">
              ✦
            </span>
            <span className="truncate font-display text-card-title text-food-dark">
              食光管理台
            </span>
            <span className="shrink-0 rounded-full border-2 border-food-line bg-food-tagBg px-2 py-0.5 text-xs font-bold text-food-muted">
              M4
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href="#/"
              className="rounded-full border-2 border-food-line bg-food-tagBg px-4 py-1.5 font-rounded text-control font-medium text-food-dark shadow-foodSticker transition-all duration-200 hover:-translate-y-0.5 hover:text-food-primary focus:outline-none focus-visible:shadow-foodFocus"
            >
              回到主站
            </a>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-full border-2 border-food-line bg-food-primary px-4 py-1.5 font-rounded text-control font-bold text-white shadow-foodTab transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:shadow-foodFocus"
            >
              登出
            </button>
          </div>
        </div>

        <nav className="no-scrollbar mx-auto flex w-full max-w-6xl gap-2 overflow-x-auto px-4 pb-3">
          {TABS.map((item) => {
            const active = item.key === tab
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                aria-pressed={active}
                className={
                  active
                    ? 'shrink-0 rounded-full border-2 border-food-line bg-food-primary px-4 py-1.5 font-rounded text-control font-bold text-white shadow-foodTab transition-all duration-200 hover:-translate-y-0.5'
                    : 'shrink-0 rounded-full border-2 border-food-line bg-food-surface px-4 py-1.5 font-rounded text-control font-medium text-food-dark shadow-foodSticker transition-all duration-200 hover:-translate-y-0.5 hover:text-food-primary'
                }
              >
                {item.label}
              </button>
            )
          })}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        {tab === 'dashboard' ? <AdminDashboard /> : null}
        {tab === 'sites' ? <AdminSites /> : null}
        {tab === 'categories' ? <AdminCategories /> : null}
        {tab === 'checks' ? <AdminChecks /> : null}
        {tab === 'stats' ? <AdminStats /> : null}
      </main>
    </div>
  )
}
