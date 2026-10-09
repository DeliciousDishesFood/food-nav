import { errorResponse, fail, ok } from './_lib/response.js'
import {
  categoryExists,
  createSite,
  getDb,
  listSites,
  toSiteDto,
} from './_lib/db.js'
import { authGuard } from './_lib/auth.js'
import { readJson, validateSitePayload } from './_lib/validate.js'

/**
 * GET /api/sites?category=<key>&q=<词>&status=active&sort=manual|heat
 * 平铺数组，默认只回 status='active'（broken 过滤）
 */
export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url)
    const filter = {
      category: (url.searchParams.get('category') || '').trim(),
      q: (url.searchParams.get('q') || '').trim(),
      status: (url.searchParams.get('status') || 'active').trim() || 'active',
      sort: (url.searchParams.get('sort') || 'manual').trim(),
    }
    const rows = await listSites(getDb(context.env), filter)
    return ok(rows.map(toSiteDto), context.request)
  } catch (error) {
    return errorResponse(error, context.request)
  }
}

/** POST /api/sites 创建站点（Bearer 鉴权）→ 201 {ok,data:siteDto} */
export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const denied = await authGuard(request, env)
    if (denied) return denied
    const db = getDb(env)
    const body = await readJson(request)
    const validated = validateSitePayload(body, { requireComplete: true })
    if (!validated.ok) {
      return fail('validation_error', validated.message, request, 400)
    }
    if (!(await categoryExists(db, validated.value.categoryId))) {
      return fail('validation_error', '所选分类不存在', request, 400)
    }
    const row = await createSite(db, validated.value)
    return ok(toSiteDto(row), request, 201)
  } catch (error) {
    return errorResponse(error, request)
  }
}
