import { errorResponse, fail, ok } from './_lib/response.js'
import { getDb } from './_lib/db.js'
import { isSameOriginRequest, sameOriginDenied } from './_lib/track.js'
import { getFvId } from './_lib/visitor.js'

/**
 * GET /api/favorites —— 当前访客的收藏列表（M9 收藏服务端化）
 * 同源校验 + fv_id（缺失 → 401 no_visitor）；免签名校验（读操作只拿自己的列表，无收益）。
 * @returns {ok:true, data:[{siteId, name}]}  name 供前端做 name 级并集合并（卡片契约仍是 name）
 */
export async function onRequestGet(context) {
  const { request, env } = context
  try {
    if (!isSameOriginRequest(request, request.url)) return sameOriginDenied(request)
    const fvId = getFvId(request)
    if (!fvId) return fail('no_visitor', '缺少访客标识', request, 401)
    const db = getDb(env)
    const { results } = await db
      .prepare(
        `SELECT f.site_id AS site_id, s.name AS name
         FROM favorites f
         JOIN sites s ON s.id = f.site_id
         WHERE f.visitor_id = ?
         ORDER BY f.created_at DESC`,
      )
      .bind(fvId)
      .all()
    const data = (results || []).map((row) => ({ siteId: row.site_id, name: row.name }))
    return ok(data, request)
  } catch (error) {
    return errorResponse(error, request)
  }
}
