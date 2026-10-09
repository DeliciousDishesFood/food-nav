import { errorResponse, fail, ok } from '../_lib/response.js'
import {
  categoryKeyExists,
  deleteCategory,
  getCategory,
  getDb,
  toCategoryDto,
  updateCategory,
} from '../_lib/db.js'
import { authGuard } from '../_lib/auth.js'
import { readJson, validateCategoryPayload } from '../_lib/validate.js'

function parseId(raw) {
  const id = Number.parseInt(raw, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** PUT /api/categories/:id 更新分类（Bearer 鉴权）；key 禁止修改 → 400 */
export async function onRequestPut(context) {
  const { request, env, params } = context
  const id = parseId(params.id)
  if (!id) return fail('invalid_id', '分类 id 必须是正整数', request, 400)
  try {
    const denied = await authGuard(request, env)
    if (denied) return denied
    const db = getDb(env)
    const existing = await getCategory(db, id)
    if (!existing) return fail('not_found', '分类不存在', request, 404)

    const body = await readJson(request)
    if (
      body &&
      Object.prototype.hasOwnProperty.call(body, 'key') &&
      typeof body.key === 'string' &&
      body.key.trim() !== existing.key
    ) {
      // 前端路由与主站 Tab 以 key 为标识，改 key 会断链
      return fail('key_immutable', '分类 key 不允许修改', request, 400)
    }
    const validated = validateCategoryPayload(body)
    if (!validated.ok) return fail('validation_error', validated.message, request, 400)
    if (Object.keys(validated.value).length === 0) {
      return fail('validation_error', '没有可更新的字段', request, 400)
    }
    if (
      validated.value.key !== undefined &&
      (await categoryKeyExists(db, validated.value.key, id))
    ) {
      return fail('key_conflict', '该分类 key 已存在', request, 409)
    }
    const row = await updateCategory(db, id, validated.value)
    return ok(toCategoryDto(row), request)
  } catch (error) {
    return errorResponse(error, request)
  }
}

/** DELETE /api/categories/:id 删除分类（级联删除该分类下所有站点）→ {ok,data:{id}} */
export async function onRequestDelete(context) {
  const { request, env, params } = context
  const id = parseId(params.id)
  if (!id) return fail('invalid_id', '分类 id 必须是正整数', request, 400)
  try {
    const denied = await authGuard(request, env)
    if (denied) return denied
    const db = getDb(env)
    const existing = await getCategory(db, id)
    if (!existing) return fail('not_found', '分类不存在', request, 404)
    await deleteCategory(db, id)
    return ok({ id }, request)
  } catch (error) {
    return errorResponse(error, request)
  }
}
