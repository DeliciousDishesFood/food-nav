import { errorResponse, fail, ok } from '../_lib/response.js'
import {
  categoryExists,
  deleteSite,
  getDb,
  getSite,
  toSiteDto,
  updateSite,
} from '../_lib/db.js'
import { authGuard } from '../_lib/auth.js'
import { readJson, validateSitePayload } from '../_lib/validate.js'

function parseId(raw) {
  const id = Number.parseInt(raw, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** GET /api/sites/:id → 单站详情；不存在 → 404 + {ok:false,error:{code:'not_found'}} */
export async function onRequestGet(context) {
  const id = parseId(context.params.id)
  if (!id) {
    return fail('invalid_id', '站点 id 必须是正整数', context.request, 400)
  }
  try {
    const row = await getSite(getDb(context.env), id)
    if (!row) {
      return fail('not_found', '站点不存在', context.request, 404)
    }
    return ok(toSiteDto(row), context.request)
  } catch (error) {
    return errorResponse(error, context.request)
  }
}

/** PUT /api/sites/:id 更新站点（Bearer 鉴权）→ {ok,data:siteDto}；不存在 → 404 */
export async function onRequestPut(context) {
  const { request, env, params } = context
  const id = parseId(params.id)
  if (!id) return fail('invalid_id', '站点 id 必须是正整数', request, 400)
  try {
    const denied = await authGuard(request, env)
    if (denied) return denied
    const db = getDb(env)
    const existing = await getSite(db, id)
    if (!existing) return fail('not_found', '站点不存在', request, 404)
    const body = await readJson(request)
    const validated = validateSitePayload(body)
    if (!validated.ok) return fail('validation_error', validated.message, request, 400)
    if (Object.keys(validated.value).length === 0) {
      return fail('validation_error', '没有可更新的字段', request, 400)
    }
    if (
      validated.value.categoryId !== undefined &&
      !(await categoryExists(db, validated.value.categoryId))
    ) {
      return fail('validation_error', '所选分类不存在', request, 400)
    }
    const row = await updateSite(db, id, validated.value)
    return ok(toSiteDto(row), request)
  } catch (error) {
    return errorResponse(error, request)
  }
}

/** DELETE /api/sites/:id 删除站点（Bearer 鉴权，site_stats 级联）→ {ok,data:{id}} */
export async function onRequestDelete(context) {
  const { request, env, params } = context
  const id = parseId(params.id)
  if (!id) return fail('invalid_id', '站点 id 必须是正整数', request, 400)
  try {
    const denied = await authGuard(request, env)
    if (denied) return denied
    const db = getDb(env)
    const existing = await getSite(db, id)
    if (!existing) return fail('not_found', '站点不存在', request, 404)
    await deleteSite(db, id)
    return ok({ id }, request)
  } catch (error) {
    return errorResponse(error, request)
  }
}
