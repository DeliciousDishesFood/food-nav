import { errorResponse, ok } from '../_lib/response.js'
import { getDb } from '../_lib/db.js'
import { authGuard } from '../_lib/auth.js'

/** 每日 UV：按 (日期, 访客) 去重后的访问数（daily_visits 表，见 migration 004） */
const DEFAULT_DAYS = 30
const MAX_DAYS = 365

function clampDays(raw) {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed)) return DEFAULT_DAYS
  return Math.min(Math.max(parsed, 1), MAX_DAYS)
}

/**
 * GET /api/stats/visits?days=30（Bearer 鉴权）
 * → { ok:true, data:{ list:[{date:'YYYY-MM-DD', uv:number}] } }
 * 按日期升序；无数据日期不补 0（图表由前端自行对齐）。
 * days=1 → 仅今日。
 */
export async function onRequestGet(context) {
  const { request, env } = context
  try {
    const denied = await authGuard(request, env)
    if (denied) return denied
    const db = getDb(env)
    const days = clampDays(new URL(request.url).searchParams.get('days'))
    const { results } = await db
      .prepare(
        `SELECT visit_date AS date, COUNT(*) AS uv
         FROM daily_visits
         WHERE visit_date >= date('now', ?)
         GROUP BY visit_date
         ORDER BY visit_date ASC`,
      )
      .bind(`-${days - 1} days`)
      .all()
    const list = (results || []).map((row) => ({
      date: row.date,
      uv: Number(row.uv) || 0,
    }))
    return ok({ list, days }, request)
  } catch (error) {
    return errorResponse(error, request)
  }
}
