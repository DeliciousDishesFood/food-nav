import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage, fetchCheckLogs, runCheck } from './AdminApi.js'

const LOG_LIMIT = 30
/** 全量检测循环上限（每轮 ≤10 站，剩余 >0 时继续下一轮） */
const MAX_ROUNDS = 15

const RESULT_BADGE = {
  active: 'bg-food-mint text-food-dark',
  broken: 'bg-food-primary text-white',
  checking: 'bg-food-sun text-food-dark',
}

const RESULT_LABEL = {
  active: '正常',
  broken: '失效',
  checking: '检测中',
}

function formatTime(value) {
  if (!value) return '—'
  const parsed = new Date(`${String(value).replace(' ', 'T')}Z`)
  if (Number.isNaN(parsed.getTime())) return value
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`
}

function SummaryCard({ label, value, accent }) {
  return (
    <div className="rounded-3xl border-2 border-food-line bg-food-surface p-3 shadow-foodSticker">
      <p className="font-rounded text-xs text-food-muted">{label}</p>
      <p className={`mt-0.5 font-display text-card-title ${accent || 'text-food-dark'}`}>{value}</p>
    </div>
  )
}

/** 检测中心（M3）：手动触发检测 + 本轮结果 + 最近检测日志 */
export default function AdminChecks() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ rounds: 0, checked: 0, remaining: 0 })
  const [totals, setTotals] = useState(null)
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [logs, setLogs] = useState({ list: [], total: 0 })
  const [logsLoading, setLogsLoading] = useState(true)
  const offsetRef = useRef(0)

  const loadLogs = useCallback(async (append) => {
    const offset = append ? offsetRef.current : 0
    const { payload } = await fetchCheckLogs({ limit: LOG_LIMIT, offset })
    if (payload.ok === true && payload.data) {
      offsetRef.current = offset + payload.data.list.length
      setLogs((prev) => ({
        list: append ? [...prev.list, ...payload.data.list] : payload.data.list,
        total: payload.data.total,
      }))
    } else {
      setError(errorMessage(payload))
    }
    setLogsLoading(false)
  }, [])

  const reloadLogs = (append) => {
    setLogsLoading(true)
    loadLogs(append)
  }

  useEffect(() => {
    loadLogs(false)
  }, [loadLogs])

  const startRun = async () => {
    if (running) return
    setRunning(true)
    setError('')
    setResults([])
    setTotals(null)
    setProgress({ rounds: 0, checked: 0, remaining: 0 })
    const startedAt = Date.now()
    let rounds = 0
    let checked = 0
    let remaining = 1
    try {
      while (remaining > 0 && rounds < MAX_ROUNDS && Date.now() - startedAt < 120000) {
        const { payload } = await runCheck(undefined, startedAt)
        if (payload.ok !== true || !payload.data) {
          setError(errorMessage(payload))
          break
        }
        const data = payload.data
        rounds += 1
        checked += data.checked
        remaining = data.remaining
        setProgress({ rounds, checked, remaining })
        setTotals((prev) => ({
          checked: (prev ? prev.checked : 0) + data.checked,
          active: (prev ? prev.active : 0) + data.active,
          broken: (prev ? prev.broken : 0) + data.broken,
          checking: (prev ? prev.checking : 0) + data.checking,
          errors: (prev ? prev.errors : 0) + data.errors,
          elapsedMs: data.elapsedMs,
        }))
        setResults((prev) => prev.concat(Array.isArray(data.results) ? data.results : []))
        if (data.checked === 0) break
      }
      if (remaining > 0 && rounds >= MAX_ROUNDS) {
        setError(`已达单次执行上限（${rounds} 轮 / ${checked} 站），剩余 ${remaining} 站未检测`)
      }
    } finally {
      setRunning(false)
      reloadLogs(false)
    }
  }

  const visibleLogs = logs.list

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-3xl border-2 border-food-line bg-food-surface p-4 shadow-foodSticker">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-rounded text-card-title font-bold text-food-dark">链接存活检测</h2>
            <p className="mt-1 text-xs text-food-muted">
              HEAD 优先（拿不到 2xx/3xx 退回 GET 复检）、单站超时 5 秒、并发 4，UA 为 Chrome
              桌面版；2xx/3xx 正常，429 不计失败；404/超时等确定性失败连续 2 次判失效，
              403/418/520-527 等可疑档连续 3 次才判失效。每日 12:00（北京时间）自动执行。
            </p>
          </div>
          <button
            type="button"
            onClick={startRun}
            disabled={running}
            className={
              running
                ? 'shrink-0 rounded-full border-2 border-food-line bg-food-tagBg px-5 py-2 font-rounded text-control font-bold text-food-muted'
                : 'shrink-0 rounded-full border-2 border-food-line bg-food-primary px-5 py-2 font-rounded text-control font-bold text-white shadow-foodTab transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:shadow-foodFocus'
            }
          >
            {running ? '检测中…' : '开始检测'}
          </button>
        </div>

        <p className="mt-3 text-xs text-food-muted" data-testid="check-progress">
          {running
            ? `检测中… 第 ${progress.rounds} 轮，已完成 ${progress.checked} 站${
                progress.remaining > 0 ? `，剩余 ${progress.remaining} 站` : ''
              }`
            : totals
              ? `上轮执行完成：共检测 ${totals.checked} 站，用时约 ${totals.elapsedMs}ms`
              : '点击「开始检测」执行全量检测（单轮最多 10 站，自动分批跑完）'}
        </p>

        {error ? (
          <p className="mt-3 rounded-2xl border-2 border-food-accent-soft bg-food-tagBg px-4 py-2.5 text-control text-food-primary">
            {error}
          </p>
        ) : null}

        {totals ? (
          <div className="mt-4 grid grid-cols-3 gap-3 md:grid-cols-6">
            <SummaryCard label="已检测" value={totals.checked} />
            <SummaryCard label="正常" value={totals.active} accent="text-food-mint" />
            <SummaryCard label="失效" value={totals.broken} accent="text-food-primary" />
            <SummaryCard label="检测中" value={totals.checking} accent="text-food-sun" />
            <SummaryCard label="错误" value={totals.errors} />
            <SummaryCard label="耗时(ms)" value={totals.elapsedMs} />
          </div>
        ) : null}

        {results.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-3xl border-2 border-food-line bg-food-surface2">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-2 border-food-line font-rounded text-control text-food-muted">
                  <th className="px-3 py-2 font-bold">站点</th>
                  <th className="px-3 py-2 font-bold">结果</th>
                  <th className="px-3 py-2 font-bold">状态码</th>
                  <th className="px-3 py-2 font-bold">耗时</th>
                  <th className="px-3 py-2 font-bold">说明</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item) => (
                  <tr
                    key={`${item.id}-${item.statusCode}-${item.durationMs}`}
                    className="border-b border-food-accent-soft last:border-b-0"
                  >
                    <td className="max-w-[200px] truncate px-3 py-2 font-rounded font-bold text-food-dark">
                      {item.name}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full border-2 border-food-line px-2.5 py-0.5 text-xs font-bold ${RESULT_BADGE[item.status] || 'bg-food-tagBg text-food-muted'}`}
                      >
                        {RESULT_LABEL[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-food-dark">{item.statusCode || '—'}</td>
                    <td className="px-3 py-2 text-food-muted">{item.durationMs}ms</td>
                    <td className="max-w-[260px] truncate px-3 py-2 text-food-muted">{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border-2 border-food-line bg-food-surface p-4 shadow-foodSticker">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-rounded text-card-title font-bold text-food-dark">最近检测日志</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => reloadLogs(false)}
              className="rounded-full border-2 border-food-line bg-food-tagBg px-3 py-1 font-rounded text-xs font-bold text-food-dark shadow-foodSticker transition-all hover:-translate-y-0.5 hover:text-food-primary"
            >
              刷新
            </button>
            {visibleLogs.length < logs.total ? (
              <button
                type="button"
                onClick={() => reloadLogs(true)}
                disabled={logsLoading}
                className="rounded-full border-2 border-food-line bg-food-surface px-3 py-1 font-rounded text-xs font-bold text-food-primary shadow-foodSticker transition-all hover:-translate-y-0.5 disabled:text-food-muted"
              >
                加载更多
              </button>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border-2 border-food-line bg-food-surface2">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-food-line font-rounded text-control text-food-muted">
                <th className="px-3 py-2.5 font-bold">时间</th>
                <th className="px-3 py-2.5 font-bold">站点</th>
                <th className="px-3 py-2.5 font-bold">结果</th>
                <th className="px-3 py-2.5 font-bold">状态码</th>
                <th className="px-3 py-2.5 font-bold">耗时</th>
                <th className="px-3 py-2.5 font-bold">说明</th>
              </tr>
            </thead>
            <tbody>
              {logsLoading && visibleLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-food-muted">
                    日志加载中…
                  </td>
                </tr>
              ) : visibleLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-food-muted">
                    还没有检测记录，点上方「开始检测」
                  </td>
                </tr>
              ) : (
                visibleLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-food-accent-soft last:border-b-0 hover:bg-food-surface"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-food-muted">
                      {formatTime(log.checkedAt)}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 font-rounded font-bold text-food-dark">
                      {log.siteName}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full border-2 border-food-line px-2.5 py-0.5 text-xs font-bold ${log.ok ? 'bg-food-mint text-food-dark' : 'bg-food-primary text-white'}`}
                      >
                        {log.ok ? '可访问' : '失败'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-food-dark">{log.statusCode || '超时'}</td>
                    <td className="px-3 py-2 text-food-muted">{log.durationMs}ms</td>
                    <td className="max-w-[280px] truncate px-3 py-2 text-food-muted">{log.note}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-xs text-food-muted">
          共 {logs.total} 条日志（保留 30 天），当前展示 {visibleLogs.length} 条
          {logsLoading ? ' · 加载中…' : ''}
        </p>
      </section>
    </div>
  )
}
