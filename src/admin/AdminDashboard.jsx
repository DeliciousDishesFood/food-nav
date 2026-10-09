import { useEffect, useState } from 'react'
import { errorMessage, fetchAllSites, fetchCategories, fetchVisits } from './AdminApi.js'
import AdminHeatBoard from './AdminHeatBoard.jsx'

const STATUS_BADGE = {
  active: 'bg-food-mint text-food-dark',
  broken: 'bg-food-primary text-white',
  checking: 'bg-food-sun text-food-dark',
}

const STATUS_LABEL = {
  active: '正常',
  broken: '失效',
  checking: '检测中',
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-3xl border-2 border-food-line bg-food-surface p-4 shadow-foodSticker">
      <p className="font-rounded text-control text-food-muted">{label}</p>
      <p className="mt-1 font-display text-page-title text-food-dark">{value}</p>
      {hint ? <p className="mt-1 text-xs text-food-muted">{hint}</p> : null}
    </div>
  )
}

/** UTC 'YYYY-MM-DD HH:MM:SS' → 本地 'MM-DD HH:MM' */
function formatShortTime(value) {
  if (!value) return ''
  const parsed = new Date(`${String(value).replace(' ', 'T')}Z`)
  if (Number.isNaN(parsed.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

/** 仪表盘：站点/分类/失效统计 + 今日访问（M4） */
export default function AdminDashboard() {
  const [state, setState] = useState({
    loading: true,
    sites: [],
    categories: [],
    todayUv: null,
    error: '',
  })

  useEffect(() => {
    let active = true
    Promise.all([fetchAllSites(), fetchCategories(), fetchVisits(1)]).then(
      ([sitesRes, categoriesRes, visitsRes]) => {
        if (!active) return
        const sites = sitesRes.payload.ok === true && Array.isArray(sitesRes.payload.data)
          ? sitesRes.payload.data
          : []
        const categories = categoriesRes.payload.ok === true && Array.isArray(categoriesRes.payload.data)
          ? categoriesRes.payload.data
          : []
        const error =
          sitesRes.payload.ok === true
            ? errorMessage(categoriesRes.payload, '')
            : errorMessage(sitesRes.payload, '')
        const visitList =
          visitsRes.payload.ok === true &&
          visitsRes.payload.data &&
          Array.isArray(visitsRes.payload.data.list)
            ? visitsRes.payload.data.list
            : []
        const todayUv = visitList.length ? visitList[visitList.length - 1].uv : null
        setState({ loading: false, sites, categories, todayUv, error })
      },
    )
    return () => {
      active = false
    }
  }, [])

  const { loading, sites, categories, todayUv, error } = state
  const brokenCount = sites.filter((site) => site.status === 'broken').length
  const checkingCount = sites.filter((site) => site.status === 'checking').length
  const lastChecked = sites
    .map((site) => site.lastCheckedAt)
    .filter(Boolean)
    .sort()
    .pop()

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="站点总数" value={loading ? '…' : sites.length} />
        <StatCard label="分类数" value={loading ? '…' : categories.length} />
        <StatCard
          label="失效站点"
          value={loading ? '…' : brokenCount}
          hint={
            checkingCount > 0
              ? `检测中 ${checkingCount}`
              : brokenCount > 0
                ? '失效站点主站已隐藏'
                : '暂无失效站点'
          }
        />
        <StatCard
          label="最近检测"
          value={loading ? '…' : lastChecked ? formatShortTime(lastChecked) : '—'}
          hint="数据来自链接检测"
        />
        <StatCard
          label="今日访问"
          value={loading ? '…' : todayUv ?? '—'}
          hint="按访客去重（UV）"
        />
      </div>

      {error ? (
        <p className="rounded-2xl border-2 border-food-accent-soft bg-food-tagBg px-4 py-2.5 text-control text-food-primary">
          {error}
        </p>
      ) : null}

      <section className="rounded-3xl border-2 border-food-line bg-food-surface p-4 shadow-foodSticker">
        <h2 className="mb-3 font-rounded text-card-title font-bold text-food-dark">各分类站点数</h2>
        {loading ? (
          <p className="text-control text-food-muted">统计加载中…</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {categories.map((category) => {
              const count = sites.filter((site) => site.categoryId === category.id).length
              return (
                <li
                  key={category.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border-2 border-food-accent-soft bg-food-surface2 px-3 py-2"
                >
                  <span className="min-w-0 truncate font-rounded text-control text-food-dark">
                    {category.name}
                    <span className="ml-2 text-xs text-food-muted">{category.key}</span>
                  </span>
                  <span className="shrink-0 rounded-full border-2 border-food-line bg-food-tagBg px-2.5 py-0.5 text-xs font-bold text-food-dark">
                    {count} 站
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {sites.length > 0 ? (
        <section className="rounded-3xl border-2 border-food-line bg-food-surface p-4 shadow-foodSticker">
          <h2 className="mb-3 font-rounded text-card-title font-bold text-food-dark">状态总览</h2>
          <div className="flex flex-wrap gap-2">
            {['active', 'broken', 'checking'].map((status) => {
              const count = sites.filter((site) => site.status === status).length
              return (
                <span
                  key={status}
                  className={`rounded-full border-2 border-food-line px-3 py-1 text-xs font-bold ${STATUS_BADGE[status]}`}
                >
                  {STATUS_LABEL[status]} {count}
                </span>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* M9 热度闭环：Top10 收藏/点击/热度（独立取数，收藏变化后刷新即最新） */}
      <AdminHeatBoard categories={categories} />
    </div>
  )
}
