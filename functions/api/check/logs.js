import { errorResponse, fail, ok } from '../_lib/response.js'
import { getDb } from '../_lib/db.js'
import { authGuard } from '../_lib/auth.js'

/** check_logs 行 → 接口 DTO（camelCase） */
function toLogDto(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    siteName: row.site_name || '（已删除）',
    ok: row.ok === 1,
    statusCode: row.status_code,
    durationMs: row.duration_ms,
    note: row.note,
    checkedAt: row.checked_at,
  }
}

/**
 * GET /api/check/logs?site_id=&limit=&offset=（Bearer 鉴权）
 * 分页返回最近检测日志，按 checked_at 倒序；limit 默认 20，最大 100
 * 返回 { list, total, limit, offset }
 */
export async function onRequestGet(context) {
  const { request, env } = context
  try {
    const denied = await authGuard(request, env)
    if (denied) return denied
    const db = getDb(env)

    const url = new URL(request.url)
    const rawLimit = url.searchParams.get('limit')
    const rawOffset = url.searchParams.get('offset')
    const rawSiteId = (url.searchParams.get('site_id') || '').trim()

    const limit = rawLimit === null || rawLimit === '' ? 20 : Number.parseInt(rawLimit, 10)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return fail('validation_error', 'limit 必须是 1-100 的整数', request, 400)
    }
    const offset = rawOffset === null || rawOffset === '' ? 0 : Number.parseInt(rawOffset, 10)
    if (!Number.isInteger(offset) || offset < 0) {
      return fail('validation_error', 'offset 必须是 ≥0 的整数', request, 400)
    }

    const where = []
    const params = []
    if (rawSiteId) {
      const siteId = Number.parseInt(rawSiteId, 10)
      if (!Number.isInteger(siteId) || siteId <= 0) {
        return fail('validation_error', 'site_id 必须是正整数', request, 400)
      }
      where.push('l.site_id = ?')
      params.push(siteId)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const countRow = await db
      .prepare(`SELECT COUNT(*) AS total FROM check_logs l ${whereSql}`)
      .bind(...params)
      .first()
    const { results } = await db
      .prepare(
        `SELECT l.id, l.site_id, s.name AS site_name, l.ok, l.status_code, l.duration_ms, l.note, l.checked_at
         FROM check_logs l
         LEFT JOIN sites s ON s.id = l.site_id
         ${whereSql}
         ORDER BY l.checked_at DESC, l.id DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...params, limit, offset)
      .all()

    return ok(
      {
        list: (results || []).map(toLogDto),
        total: countRow ? countRow.total : 0,
        limit,
        offset,
      },
      request,
    )
  } catch (error) {
    return errorResponse(error, request)
  }
}
