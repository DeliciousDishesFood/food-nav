import { fail, ok } from './_lib/response.js'
import { getDb, ping } from './_lib/db.js'

/** GET /api/health → { ok:true, data:{ db:'up', time } }；DB 不可用 → 503 + ok:false */
export async function onRequestGet(context) {
  try {
    const reachable = await ping(getDb(context.env))
    if (!reachable) {
      return fail('db_down', '数据库不可用', context.request, 503)
    }
    return ok(
      { db: 'up', time: new Date().toISOString() },
      context.request,
    )
  } catch (error) {
    if (error && error.code === 'DB_UNAVAILABLE') {
      return fail('db_down', '数据库未绑定，请检查 D1 binding', context.request, 503)
    }
    return fail('db_down', '数据库不可用', context.request, 503)
  }
}
