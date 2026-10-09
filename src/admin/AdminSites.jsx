import { useCallback, useEffect, useState } from 'react'
import {
  coverPreviewUrl,
  errorMessage,
  fetchAllSites,
  fetchCategories,
  removeSite,
  runCheck,
} from './AdminApi.js'
import AdminSiteForm from './AdminSiteForm.jsx'

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

/** UTC 'YYYY-MM-DD HH:MM:SS' → 本地 'MM-DD HH:MM' */
function formatShortTime(value) {
  if (!value) return ''
  const parsed = new Date(`${String(value).replace(' ', 'T')}Z`)
  if (Number.isNaN(parsed.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

function domainOf(url) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** 站点管理：筛选 / 状态徽标 / 排序展示 / 新增·编辑·删除 */
export default function AdminSites() {
  const [sites, setSites] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [checkingId, setCheckingId] = useState(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(
    () =>
      Promise.all([fetchAllSites(), fetchCategories()]).then(
        ([sitesRes, categoriesRes]) => {
          if (sitesRes.payload.ok === true && Array.isArray(sitesRes.payload.data)) {
            setSites(sitesRes.payload.data)
            setError('')
          } else {
            setError(errorMessage(sitesRes.payload))
          }
          if (categoriesRes.payload.ok === true && Array.isArray(categoriesRes.payload.data)) {
            setCategories(categoriesRes.payload.data)
          }
          setLoading(false)
        },
      ),
    [],
  )

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (site) => {
    const confirmed = window.confirm(`删除「${site.name}」？删除后主站卡片会立即消失。`)
    if (!confirmed) return
    const { payload } = await removeSite(site.id)
    if (payload.ok === true) {
      setSites((current) => current.filter((item) => item.id !== site.id))
    } else {
      setError(errorMessage(payload))
    }
  }

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (site) => {
    setEditing(site)
    setFormOpen(true)
  }

  /** 单站检测（M3）：只检这一站，结果立刻反映在状态徽标上 */
  const handleCheck = async (site) => {
    if (checkingId !== null) return
    setCheckingId(site.id)
    setNotice('')
    setError('')
    const { payload } = await runCheck(site.id)
    setCheckingId(null)
    if (payload.ok === true && payload.data && payload.data.skipped) {
      // M9-T3：豁免站不进检测队列，服务端回 {skipped:true}
      setNotice(`「${site.name}」已设置「跳过自动检测」，本次不参与检测`)
      load()
    } else if (payload.ok === true && payload.data) {
      const first = Array.isArray(payload.data.results) ? payload.data.results[0] : null
      setNotice(
        first
          ? `「${first.name}」检测完成：${STATUS_LABEL[first.status] || first.status}（${
              first.statusCode ? `HTTP ${first.statusCode}` : '超时/网络错误'
            }，${first.durationMs}ms）`
          : '检测完成',
      )
      load()
    } else {
      setError(errorMessage(payload))
    }
  }

  const visibleSites = sites.filter((site) => {
    const matchCategory = categoryFilter === 'all' || site.categoryKey === categoryFilter
    const matchStatus = statusFilter === 'all' || site.status === statusFilter
    return matchCategory && matchStatus
  })

  const categoryName = (id) =>
    categories.find((category) => category.id === id)?.name || '—'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 font-rounded text-control text-food-muted">
            分类
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="rounded-full border-2 border-food-line bg-food-surface px-3 py-1.5 font-rounded text-control text-food-dark shadow-foodSticker outline-none focus:shadow-foodFocus"
            >
              <option value="all">全部分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.key}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 font-rounded text-control text-food-muted">
            状态
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-full border-2 border-food-line bg-food-surface px-3 py-1.5 font-rounded text-control text-food-dark shadow-foodSticker outline-none focus:shadow-foodFocus"
            >
              <option value="all">全部状态</option>
              <option value="active">正常</option>
              <option value="broken">失效</option>
              <option value="checking">检测中</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-full border-2 border-food-line bg-food-primary px-5 py-2 font-rounded text-control font-bold text-white shadow-foodTab transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:shadow-foodFocus"
        >
          + 新增站点
        </button>
      </div>

      {error ? (
        <p className="rounded-2xl border-2 border-food-accent-soft bg-food-tagBg px-4 py-2.5 text-control text-food-primary">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-2xl border-2 border-food-line bg-food-tagBg px-4 py-2.5 text-control text-food-dark">
          {notice}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-3xl border-2 border-food-line bg-food-surface shadow-foodSticker">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-food-line bg-food-surface2 font-rounded text-control text-food-muted">
              <th className="px-3 py-2.5 font-bold">站点</th>
              <th className="px-3 py-2.5 font-bold">分类</th>
              <th className="px-3 py-2.5 font-bold">链接</th>
              <th className="px-3 py-2.5 font-bold">角标</th>
              <th className="px-3 py-2.5 font-bold">排序</th>
              <th className="px-3 py-2.5 font-bold">状态</th>
              <th className="px-3 py-2.5 text-right font-bold">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-food-muted">
                  站点加载中…
                </td>
              </tr>
            ) : visibleSites.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-food-muted">
                  没有符合条件的站点
                </td>
              </tr>
            ) : (
              visibleSites.map((site) => {
                const preview = coverPreviewUrl(site.coverImg)
                return (
                  <tr
                    key={site.id}
                    className="border-b border-food-accent-soft last:border-b-0 hover:bg-food-surface2"
                  >
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <span className="h-10 w-14 shrink-0 overflow-hidden rounded-xl border-2 border-food-line bg-food-tagBg">
                          {preview ? (
                            <img
                              src={preview}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-rounded font-bold text-food-dark">
                            {site.name}
                          </span>
                          <span className="block truncate text-xs text-food-muted">{site.icon}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-food-dark">{categoryName(site.categoryId)}</td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 text-food-muted">
                      {domainOf(site.url)}
                    </td>
                    <td className="px-3 py-2.5">
                      {site.tag ? (
                        <span className="rounded-full border-2 border-food-line bg-food-primary px-2 py-0.5 text-xs font-bold text-white">
                          {site.tag}
                        </span>
                      ) : (
                        <span className="text-food-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-food-muted">{site.sortOrder}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full border-2 border-food-line px-2.5 py-0.5 text-xs font-bold ${STATUS_BADGE[site.status] || 'bg-food-tagBg text-food-muted'}`}
                      >
                        {STATUS_LABEL[site.status] || site.status}
                      </span>
                      {site.skipCheck ? (
                        <span
                          title="跳过自动检测：该站由管理员手动维护，cron / 全量 / 单站检测均不参与"
                          className="ml-1.5 inline-block rounded-full border-2 border-food-line bg-food-sun px-2 py-0.5 text-xs font-bold text-food-dark align-middle"
                        >
                          豁免
                        </span>
                      ) : null}
                      <span className="mt-1 block text-xs text-food-muted">
                        {site.lastCheckedAt ? `最近 ${formatShortTime(site.lastCheckedAt)}` : '尚未检测'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleCheck(site)}
                          disabled={checkingId !== null}
                          className="rounded-full border-2 border-food-line bg-food-surface px-3 py-1 font-rounded text-xs font-bold text-food-dark shadow-foodSticker transition-all hover:-translate-y-0.5 hover:text-food-primary disabled:text-food-muted disabled:hover:translate-y-0"
                        >
                          {checkingId === site.id ? '检测中…' : '检测'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(site)}
                          className="rounded-full border-2 border-food-line bg-food-tagBg px-3 py-1 font-rounded text-xs font-bold text-food-dark shadow-foodSticker transition-all hover:-translate-y-0.5 hover:text-food-primary"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(site)}
                          className="rounded-full border-2 border-food-line bg-food-surface px-3 py-1 font-rounded text-xs font-bold text-food-primary shadow-foodSticker transition-all hover:-translate-y-0.5"
                        >
                          删除
                        </button>
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-food-muted">
        共 {sites.length} 个站点，当前展示 {visibleSites.length} 个；改动保存后主站即时生效。
      </p>

      {formOpen ? (
        <AdminSiteForm
          site={editing}
          categories={categories}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false)
            load()
          }}
        />
      ) : null}
    </div>
  )
}
