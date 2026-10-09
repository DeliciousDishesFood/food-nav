import { useEffect, useState } from 'react'
import StatsChart from './StatsChart.jsx'
import { errorMessage, fetchVisits } from './AdminApi.js'

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-3xl border-2 border-food-line bg-food-surface p-4 shadow-foodSticker">
      <p className="font-rounded text-control text-food-muted">{label}</p>
      <p className="mt-1 font-display text-page-title text-food-dark">{value}</p>
      {hint ? <p className="mt-1 text-xs text-food-muted">{hint}</p> : null}
    </div>
  )
}

/** UTC 日期（与 daily_visits 的 date('now') 同口径） */
function utcDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000)
  return date.toISOString().slice(0, 10)
}

/**
 * 访问统计（M4）：今日/昨日/近 30 天峰值 + 手写 SVG 折线图
 * 数据：GET /api/stats/visits?days=30（按 (日期, 访客) 去重的 UV）
 */
export default function AdminStats() {
  const [state, setState] = useState({ loading: true, list: [], error: '' })

  useEffect(() => {
    let alive = true
    fetchVisits(30).then(({ payload }) => {
      if (!alive) return
      const list =
        payload.ok === true && payload.data && Array.isArray(payload.data.list)
          ? payload.data.list
          : []
      setState({ loading: false, list, error: payload.ok === true ? '' : errorMessage(payload) })
    })
    return () => {
      alive = false
    }
  }, [])

  const { loading, list, error } = state
  const today = utcDate(0)
  const yesterday = utcDate(-1)
  const todayUv = list.find((item) => item.date === today)?.uv ?? null
  const yesterdayUv = list.find((item) => item.date === yesterday)?.uv ?? null
  const peak = list.reduce(
    (best, item) => (best === null || item.uv > best.uv ? item : best),
    null,
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="今日 UV"
          value={loading ? '…' : todayUv ?? '—'}
          hint="同一访客当日只计 1 次"
        />
        <StatCard
          label="昨日 UV"
          value={loading ? '…' : yesterdayUv ?? '—'}
          hint="UTC 日期口径"
        />
        <StatCard
          label="近 30 天峰值"
          value={loading ? '…' : peak ? peak.uv : '—'}
          hint={peak ? `发生在 ${peak.date}` : '暂无数据'}
        />
      </div>

      {error ? (
        <p className="rounded-2xl border-2 border-food-accent-soft bg-food-tagBg px-4 py-2.5 text-control text-food-primary">
          {error}
        </p>
      ) : null}

      <section className="rounded-3xl border-2 border-food-line bg-food-surface p-4 shadow-foodSticker">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-rounded text-card-title font-bold text-food-dark">
            近 30 天访问趋势
          </h2>
          <span className="text-xs text-food-muted">
            {loading ? '加载中…' : `共 ${list.length} 天有数据 · 仅统计页面访问`}
          </span>
        </div>
        {loading ? (
          <div className="flex h-[200px] items-center justify-center text-control text-food-muted">
            统计加载中…
          </div>
        ) : (
          <StatsChart data={list} />
        )}
        <p className="mt-3 text-xs text-food-muted">
          UV = 按匿名访客 cookie（fv_id）去重的每日独立访问数；静态资源与 /api 请求不计入。
        </p>
      </section>
    </div>
  )
}
