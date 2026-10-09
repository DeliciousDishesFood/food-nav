import { useEffect, useState } from 'react'
import { errorMessage, fetchSites } from './AdminApi.js'

/**
 * 站点热度榜（M9 热度闭环看板）：Top10 收藏 / 点击 / 热度
 * 数据 GET /api/sites?status=all&sort=heat（heat_score = 收藏×5 + 点击，后端重算）
 * 贴纸风表格与 dashboard 现有卡片一致；窄屏表格容器横向滚动不破版。
 */
export default function AdminHeatBoard({ categories = [] }) {
  const [state, setState] = useState({ loading: true, sites: [], error: '' })

  useEffect(() => {
    let alive = true
    fetchSites('all', 'heat').then(({ payload }) => {
      if (!alive) return
      const sites =
        payload.ok === true && Array.isArray(payload.data) ? payload.data.slice(0, 10) : []
      const error = payload.ok === true ? '' : errorMessage(payload)
      setState({ loading: false, sites, error })
    })
    return () => {
      alive = false
    }
  }, [])

  const { loading, sites, error } = state

  const categoryName = (site) => {
    const matched = categories.find((category) => category.id === site.categoryId)
    return (matched && matched.name) || site.categoryKey || '—'
  }

  const cellHead = 'py-2 pr-3 font-rounded font-bold text-food-muted'
  const cellBody = 'py-2 pr-3'

  return (
    <section className="rounded-3xl border-2 border-food-line bg-food-surface p-4 shadow-foodSticker">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-rounded text-card-title font-bold text-food-dark">站点热度榜</h2>
        <span className="text-xs text-food-muted">
          {loading ? '加载中…' : `Top ${sites.length} · 热度 = 收藏×5 + 点击`}
        </span>
      </div>

      {error ? (
        <p className="mb-3 rounded-2xl border-2 border-food-accent-soft bg-food-tagBg px-4 py-2.5 text-control text-food-primary">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-control text-food-muted">热度加载中…</p>
      ) : sites.length === 0 ? (
        <p className="text-control text-food-muted">暂无热度数据</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-control">
            <thead>
              <tr className="border-b-2 border-food-accent-soft">
                <th className={`${cellHead} w-10`}>#</th>
                <th className={cellHead}>站点</th>
                <th className={cellHead}>分类</th>
                <th className={`${cellHead} text-right`}>收藏</th>
                <th className={`${cellHead} text-right`}>点击</th>
                <th className={`${cellHead} text-right`}>热度</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site, index) => (
                <tr
                  key={site.id}
                  className="border-b border-food-accent-soft last:border-b-0"
                >
                  <td className={`${cellBody} font-bold text-food-muted`}>{index + 1}</td>
                  <td className={`${cellBody} min-w-[8rem] font-rounded font-bold text-food-dark`}>
                    {site.name}
                  </td>
                  <td className={`${cellBody} text-food-muted`}>{categoryName(site)}</td>
                  <td className={`${cellBody} text-right`}>{site.favoriteCount ?? 0}</td>
                  <td className={`${cellBody} text-right`}>{site.clickCount ?? 0}</td>
                  <td className={`${cellBody} text-right text-food-primary font-bold`}>
                    {site.heatScore ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
