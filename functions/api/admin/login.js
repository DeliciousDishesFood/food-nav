import { errorResponse, fail, ok } from '../_lib/response.js'
import { getDb } from '../_lib/db.js'
import {
  TOKEN_TTL_MS,
  checkPassword,
  clientIp,
  lockCheck,
  registerFail,
  registerSuccess,
  signToken,
} from '../_lib/auth.js'
import { readJson } from '../_lib/validate.js'

/**
 * POST /api/admin/login {password} → {ok,data:{token,expiresAt}}
 * - 锁定期内：429 {code:'too_many_attempts'}
 * - 密码错误：401 {code:'invalid_password'}（连续 5 次 → 429 锁 10 分钟）
 * - 成功：清零该 IP 失败计数，签发 8 小时 HMAC token
 */
export async function onRequestPost(context) {
  const { request, env } = context
  let db
  try {
    db = getDb(env)
  } catch (error) {
    return errorResponse(error, request)
  }

  try {
    const ip = clientIp(request)
    const lock = await lockCheck(db, ip)
    if (lock.locked) {
      const minutes = Math.max(1, Math.ceil(lock.retryAfterMs / 60000))
      return fail(
        'too_many_attempts',
        `密码错误次数过多，已锁定 10 分钟（约剩 ${minutes} 分钟）`,
        request,
        429,
      )
    }

    const body = await readJson(request)
    if (!body || typeof body.password !== 'string') {
      return fail('validation_error', '请填写密码', request, 400)
    }
    if (!env.ADMIN_SECRET || !env.ADMIN_PASSWORD) {
      return fail('admin_not_configured', 'ADMIN_PASSWORD / ADMIN_SECRET 未配置', request, 503)
    }

    const matched = await checkPassword(body.password, env)
    if (!matched) {
      const result = await registerFail(db, ip)
      if (result.locked) {
        return fail(
          'too_many_attempts',
          '连续 5 次密码错误，账号已锁定 10 分钟',
          request,
          429,
        )
      }
      return fail('invalid_password', '密码错误', request, 401)
    }

    await registerSuccess(db, ip)
    const { token, expiresAt } = await signToken(
      env.ADMIN_SECRET,
      { sub: 'admin' },
      TOKEN_TTL_MS,
    )
    return ok({ token, expiresAt }, request)
  } catch (error) {
    return errorResponse(error, request)
  }
}
