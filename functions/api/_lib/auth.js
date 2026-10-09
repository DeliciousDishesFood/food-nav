/**
 * 管理端鉴权（M2）：
 * - 无状态 HMAC-SHA256 token：token = base64url(payload) + '.' + base64url(HMAC(payload, ADMIN_SECRET))
 * - 密码比对：SHA-256 摘要 + 逐字节 XOR 恒定时间比较（防时序攻击，不用 ===）
 * - 登录失败锁定：admin_attempts 表，按 IP 计数，连续 5 次失败锁 10 分钟
 * 运行时为 Cloudflare Workers（仅 Web Crypto，不依赖 Node crypto 模块）
 */
import { fail } from './response.js'

/** token 有效期：8 小时 */
export const TOKEN_TTL_MS = 8 * 60 * 60 * 1000
/** 单 IP 连续失败上限与锁定时长 */
export const MAX_FAILS = 5
export const LOCK_MS = 10 * 60 * 1000

const textEncoder = new TextEncoder()

/** bytes → base64url（去填充） */
function base64UrlEncode(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64url → bytes（非法输入抛错，由调用方兜底返回 null） */
function base64UrlDecode(text) {
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** HMAC-SHA256 → base64url */
async function hmacSha256(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(data))
  return base64UrlEncode(new Uint8Array(signature))
}

/** SHA-256 摘要（用于密码恒定时间比较） */
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value))
  return new Uint8Array(digest)
}

/** 定长字符串恒定时间比较（签名长度固定，长度不等直接判否） */
function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 摘要恒定时间比较：时序只与固定 32 字节有关，与明文内容/长度无关 */
async function digestMatches(input, expected) {
  const [a, b] = await Promise.all([sha256(input), sha256(expected)])
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

/**
 * 签发 token
 * @param {string} secret ADMIN_SECRET
 * @param {Object} payload 附加声明（如 {sub:'admin'}）
 * @param {number} [ttlMs] 有效期
 * @returns {Promise<{token: string, expiresAt: number}>}
 */
export async function signToken(secret, payload, ttlMs = TOKEN_TTL_MS) {
  const now = Date.now()
  const body = { ...payload, iat: now, exp: now + ttlMs }
  const encoded = base64UrlEncode(textEncoder.encode(JSON.stringify(body)))
  const signature = await hmacSha256(secret, encoded)
  return { token: `${encoded}.${signature}`, expiresAt: body.exp }
}

/**
 * 验签 + 过期校验
 * @returns {Promise<Object|null>} 通过返回 payload，否则 null
 */
export async function verifyToken(token, secret) {
  if (typeof token !== 'string' || typeof secret !== 'string' || !secret) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  try {
    const expected = await hmacSha256(secret, parts[0])
    if (!timingSafeEqualString(parts[1], expected)) return null
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])))
    if (!payload || typeof payload.exp !== 'number') return null
    if (payload.exp <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}

/**
 * 恒定时间密码比对（未配置 ADMIN_PASSWORD 一律失败）
 * @returns {Promise<boolean>}
 */
export async function checkPassword(input, env) {
  const expected = env && typeof env.ADMIN_PASSWORD === 'string' ? env.ADMIN_PASSWORD : ''
  if (!expected) return false
  if (typeof input !== 'string') return false
  return digestMatches(input, expected)
}

function unauthorizedError() {
  const error = new Error('登录已过期，请重新登录')
  error.code = 'unauthorized'
  return error
}

/**
 * 解析 Authorization: Bearer <token> 并验签
 * @throws {{code:'unauthorized'}} 缺失/无效/过期
 */
export async function requireAuth(request, env) {
  const header = request && request.headers ? request.headers.get('Authorization') : null
  const match = header ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null
  if (!match) throw unauthorizedError()
  const payload = await verifyToken(match[1], env ? env.ADMIN_SECRET : '')
  if (!payload) throw unauthorizedError()
  return payload
}

/**
 * 写接口鉴权守卫：成功返回 null，失败返回已组装好的 401 信封响应
 * @returns {Promise<Response|null>}
 */
export async function authGuard(request, env) {
  try {
    await requireAuth(request, env)
    return null
  } catch {
    return fail('unauthorized', '登录已过期，请重新登录', request, 401)
  }
}

/** 取客户端 IP（Cloudflare 注入；本地开发回退 unknown） */
export function clientIp(request) {
  return (request && request.headers && request.headers.get('CF-Connecting-IP')) || 'unknown'
}

/**
 * 锁定检查：锁定期内返回 {locked:true, retryAfterMs}
 * @param {D1Database} db
 * @param {string} ip
 */
export async function lockCheck(db, ip) {
  const row = await db
    .prepare('SELECT fail_count, locked_until FROM admin_attempts WHERE ip = ?')
    .bind(ip)
    .first()
  if (!row || !row.locked_until) return { locked: false }
  const until = Date.parse(row.locked_until)
  if (!Number.isFinite(until) || until <= Date.now()) return { locked: false }
  return { locked: true, retryAfterMs: until - Date.now() }
}

/**
 * 记录一次失败：达到 MAX_FAILS → 写 locked_until（now + 10min）
 * @returns {Promise<{failCount:number, locked:boolean, lockedUntil:string|null}>}
 */
export async function registerFail(db, ip) {
  const row = await db
    .prepare('SELECT fail_count, locked_until FROM admin_attempts WHERE ip = ?')
    .bind(ip)
    .first()
  const now = Date.now()
  // locked_until 已过期 → 计数重新开始（否则解锁后一次失败立刻复锁）；
  // 从未锁定（locked_until 为空）→ 在原计数上累加，直到 MAX_FAILS
  const lockExpired =
    row && row.locked_until && Number.isFinite(Date.parse(row.locked_until))
      ? Date.parse(row.locked_until) <= now
      : false
  const failCount = (row ? (lockExpired ? 0 : row.fail_count) : 0) + 1
  const locked = failCount >= MAX_FAILS
  const lockedUntil = locked ? new Date(now + LOCK_MS).toISOString() : null
  await db
    .prepare(
      `INSERT INTO admin_attempts (ip, fail_count, locked_until, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(ip) DO UPDATE SET
         fail_count = excluded.fail_count,
         locked_until = excluded.locked_until,
         updated_at = datetime('now')`,
    )
    .bind(ip, failCount, lockedUntil)
    .run()
  return { failCount, locked, lockedUntil }
}

/** 登录成功：清零该 IP 的失败记录 */
export async function registerSuccess(db, ip) {
  await db.prepare('DELETE FROM admin_attempts WHERE ip = ?').bind(ip).run()
}
