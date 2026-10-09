import { corsHeaders, errorResponse, fail } from '../_lib/response.js'
import { getDb } from '../_lib/db.js'
import { clientIp } from '../_lib/auth.js'
import {
  TRACK_LIMIT_PER_MINUTE,
  bumpSiteStat,
  bumpSiteStatDelta,
  isSameOriginRequest,
  overTrackLimit,
  sameOriginDenied,
} from '../_lib/track.js'
import { readJson } from '../_lib/validate.js'
import { requireVisitor, verifyFavSign } from '../_lib/visitor.js'

/**
 * 收藏写接口（M9）：PUT 收藏 +1 / DELETE 取消 -1（防负），签名校验 + 限频。
 * 响应信封按任务卡为扁平结构：{ok:true, favorited:true|false}；超限 {ok:true, favorited:null, limited:true}。
 * 计数只在 favorites 行真正变化时增减（INSERT OR IGNORE / DELETE 命中行），
 * 保证重复收藏不双计、取消有减（favorite_count 由 favorites 表原子维护，heat 同步重算）。
 */
function parseId(raw) {
  const id = Number.parseInt(raw, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** 扁平成功信封：{ok:true, ...body}（200，no-store + dev CORS） */
function favOk(request, body) {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status: 200,
    headers: Object.assign(
      {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
      corsHeaders(request),
    ),
  })
}

/**
 * 写请求公共前置（PUT/DELETE 共用）：
 * 同源 → id 合法 → fv_id → body.visitor_id 绑定 → X-Fav-Sign → 限频
 * @returns {Promise<{request:Request, env:object, db:object, fvId:string}|Response>}
 *   通过返回上下文，否则返回已组装好的失败 / 限频信封 Response
 */
async function prepareWrite(context) {
  const { request, env, params } = context
  const siteId = parseId(params.id)
  if (!siteId) return fail('invalid_id', '站点 id 必须是正整数', request, 400)
  if (!isSameOriginRequest(request, request.url)) return sameOriginDenied(request)

  const visitor = requireVisitor(request)
  if (visitor.denied) return visitor.denied
  const fvId = visitor.fvId

  const body = await readJson(request)
  const bodyVisitor = body && typeof body.visitor_id === 'string' ? body.visitor_id : ''
  if (!bodyVisitor || bodyVisitor !== fvId) {
    return fail('visitor_mismatch', 'visitor_id 与访客标识不一致', request, 400)
  }

  if (!(await verifyFavSign(request, fvId, env))) {
    return fail('bad_sign', '签名校验失败', request, 401)
  }

  const db = getDb(env)
  // 限频桶 'favorite'（30/分/IP，与 track/favorite 共用；前端已停用 track/favorite，无冲突）
  const limited = await overTrackLimit(
    db,
    clientIp(request),
    'favorite',
    TRACK_LIMIT_PER_MINUTE,
  )
  // 超限静默：HTTP 200 + limited:true，前端视为成功（不回滚），避免误伤用户
  if (limited) return favOk(request, { favorited: null, limited: true })

  return { request, env, db, fvId, siteId }
}

/** PUT /api/favorites/:id 收藏（幂等）→ {ok:true, favorited:true}；站点不存在 → 404 site_not_found */
export async function onRequestPut(context) {
  try {
    const prepared = await prepareWrite(context)
    if (prepared instanceof Response) return prepared
    const { db, fvId, siteId, request } = prepared

    const site = await db.prepare('SELECT id FROM sites WHERE id = ?').bind(siteId).first()
    if (!site) return fail('site_not_found', '站点不存在', request, 404)

    // 联合主键幂等：已收藏 → 命中 0 行 → 不重复 +1
    const { results } = await db
      .prepare(
        'INSERT OR IGNORE INTO favorites (visitor_id, site_id) VALUES (?, ?) RETURNING site_id',
      )
      .bind(fvId, siteId)
      .all()
    if (results && results.length > 0) await bumpSiteStat(db, siteId, 'favorite')

    return favOk(request, { favorited: true })
  } catch (error) {
    return errorResponse(error, context.request)
  }
}

/** DELETE /api/favorites/:id 取消收藏 → {ok:true, favorited:false}（favorite_count MAX(0,-1) 防负） */
export async function onRequestDelete(context) {
  try {
    const prepared = await prepareWrite(context)
    if (prepared instanceof Response) return prepared
    const { db, fvId, siteId, request } = prepared

    // 命中行才 -1（本就没收藏时 changes=0，不扣计数）
    const { results } = await db
      .prepare('DELETE FROM favorites WHERE visitor_id = ? AND site_id = ? RETURNING site_id')
      .bind(fvId, siteId)
      .all()
    if (results && results.length > 0) await bumpSiteStatDelta(db, siteId, 'favorite', -1)

    return favOk(request, { favorited: false })
  } catch (error) {
    return errorResponse(error, context.request)
  }
}
