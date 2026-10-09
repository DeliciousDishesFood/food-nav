/**
 * M9 访客标识 + 收藏轻签名（防「顺手改包」，不防逆向）：
 * - fv_id：_middleware.js 给页面种的一年期匿名 uuid cookie，这里只读取
 * - X-Fav-Sign = sha256hex(fv_id + FAVORITE_SALT) 前 32 位（Workers Web Crypto）
 *
 * 局限（写明给后来者）：签名 key 与前端常量同值（随 JS 公开下发），
 * 本层只挡「顺手改包 / 批量换 visitor_id」这类低级刷子；深度防刷靠两层：
 * ① body.visitor_id 必须等于 fv_id cookie（换 id 就对不上）② IP×分钟桶限频。
 * FAVORITE_SALT 来自 pages secret（本地 functions/.dev.vars），**必须与前端常量同值**，
 * 否则 PUT/DELETE 全部 401 bad_sign（前端会回滚，功能退化为纯本地）。
 */
import { fail } from './response.js'

/** 收藏签名请求头 */
export const FAV_SIGN_HEADER = 'X-Fav-Sign'

const textEncoder = new TextEncoder()

/** 从 Cookie 头取指定 name（无 / 空值 → null） */
export function readCookie(request, name) {
  const header = request && request.headers ? request.headers.get('cookie') : null
  if (!header) return null
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim()
      return value || null
    }
  }
  return null
}

/** 读 fv_id（middleware 已种一年期 cookie）；缺失 → null */
export function getFvId(request) {
  return readCookie(request, 'fv_id')
}

/**
 * 写操作前置守卫：缺 fv_id → 拒绝信封
 * @returns {{fvId: string|null, denied: Response|null}}
 */
export function requireVisitor(request) {
  const fvId = getFvId(request)
  if (!fvId) {
    return { fvId: null, denied: fail('no_visitor', '缺少访客标识', request, 401) }
  }
  return { fvId, denied: null }
}

/** 定长字符串恒定时间比较（长度不等直接判否；与 auth.js 同思路，此处不导出故本地实现） */
function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** sha256hex(fvId + salt) 前 32 位（与前端 useFavorites.favSign 同算法同截断） */
export async function favSign(fvId, salt) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(String(fvId) + String(salt)),
  )
  let hex = ''
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0')
  return hex.slice(0, 32)
}

/**
 * 校验 X-Fav-Sign（PUT/DELETE 必查，GET 免查——读操作只泄露自己的收藏，无收益）
 * @returns {Promise<boolean>} true = 通过
 */
export async function verifyFavSign(request, fvId, env) {
  const salt = env && typeof env.FAVORITE_SALT === 'string' ? env.FAVORITE_SALT : ''
  if (!salt || !fvId) return false
  const got = request.headers.get(FAV_SIGN_HEADER)
  if (!got) return false
  try {
    return timingSafeEqualString(got.trim(), await favSign(fvId, salt))
  } catch {
    return false
  }
}
