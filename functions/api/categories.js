import { errorResponse, fail, ok } from './_lib/response.js'
import {
  categoryKeyExists,
  createCategory,
  getDb,
  listCategories,
  toCategoryDto,
} from './_lib/db.js'
import { authGuard } from './_lib/auth.js'
import { readJson, validateCategoryPayload } from './_lib/validate.js'

/** GET /api/categories → { ok:true, data:[{id,key,name,icon,sortOrder}] } 按 sortOrder */
export async function onRequestGet(context) {
  try {
    const rows = await listCategories(getDb(context.env))
    return ok(rows.map(toCategoryDto), context.request)
  } catch (error) {
    return errorResponse(error, context.request)
  }
}

/** POST /api/categories 创建分类（Bearer 鉴权）→ 201 {ok,data:categoryDto}；key 冲突 → 409 */
export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const denied = await authGuard(request, env)
    if (denied) return denied
    const db = getDb(env)
    const body = await readJson(request)
    const validated = validateCategoryPayload(body, { requireComplete: true })
    if (!validated.ok) {
      return fail('validation_error', validated.message, request, 400)
    }
    if (await categoryKeyExists(db, validated.value.key)) {
      return fail('key_conflict', '该分类 key 已存在', request, 409)
    }
    const row = await createCategory(db, validated.value)
    return ok(toCategoryDto(row), request, 201)
  } catch (error) {
    return errorResponse(error, request)
  }
}
