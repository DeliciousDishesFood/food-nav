/**
 * M4 热度上报公共层：同源校验 + IP×分钟桶限频 + site_stats 热度重算
 *
 * 同源校验：优先 Sec-Fetch-Site（浏览器天然携带，跨站为 cross-site/site）；
 *           缺失时回退 Origin 白名单（本站 origin + localhost 开发端口）。
 * 限频：track_limits 表 (ip, bucket) 计数，bucket = '<kind>-YYYY-MM-DD-HH24-MI'（UTC 分钟桶），
 *      超限静默跳过（不报错、不封禁），页面行为零影响。
 * 热度：heat_score = favorite_count × 5 + click_count（见 03-m1-backend-detail.md §二）。
 */
import { clientIp } from './auth.js'
import { getDb } from './db.js'
import { fail, ok } from './response.js'
import { readJson } from './validate.js'

/** 单 IP 单分钟单类型上限（超限静默跳过） */
export const TRACK_LIMIT_PER_MINUTE = 30
/** 限频桶保留时长（分钟） */
export const LIMIT_RETENTION_MINUTES = 60
/** 收藏权重（heat = favorite × 5 + click） */
export const FAVORITE_WEIGHT = 5

/** kind → 计数列（白名单，杜绝拼接注入） */
const KIND_COLUMN = { click: 'click_count', favorite: 'favorite_count' }

function pad2(value) {
  return String(value).padStart(2, '0')
}

/** 分钟时间桶：YYYY-MM-DD-HH24-MI（UTC） */
export function minuteBucket(now = Date.now()) {
  const date = new Date(now)
  return (
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}-` +
    `${pad2(date.getUTCHours())}-${pad2(date.getUTCMinutes())}`
  )
}

/**
 * 同源校验
 * @returns {boolean} true = 放行
 */
export function isSameOriginRequest(request, requestUrl) {
  const site = request.headers.get('Sec-Fetch-Site')
  if (site) return site === 'same-origin' || site === 'none'
  const origin = request.headers.get('Origin')
  if (!origin) return true
  try {
    if (origin === new URL(requestUrl).origin) return true
  } catch {
    return false
  }
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

/** 同源校验失败 → 403 信封 */
export function sameOriginDenied(request) {
  return fail('forbidden', '跨站请求被拒绝', request, 403)
}

/** 清理超过保留期的限频桶（按 kind 前缀删除，避免跨 kind 字符串误删） */
async function cleanupTrackLimits(db, kind) {
  const cutoff = new Date(Date.now() - LIMIT_RETENTION_MINUTES * 60000)
  const stamp =
    `${cutoff.getUTCFullYear()}-${pad2(cutoff.getUTCMonth() + 1)}-${pad2(cutoff.getUTCDate())}-` +
    `${pad2(cutoff.getUTCHours())}-${pad2(cutoff.getUTCMinutes())}`
  await db
    .prepare('DELETE FROM track_limits WHERE bucket LIKE ? AND bucket < ?')
    .bind(`${kind}-%`, `${kind}-${stamp}`)
    .run()
}

/**
 * IP × 分钟桶限频（每次调用计数 +1）
 * @param {number} [limit] 本类型单 IP 每分钟上限（默认 TRACK_LIMIT_PER_MINUTE；
 *   AI 问答等高成本接口由调用方传更小值，如 10）
 * @returns {Promise<boolean>} true = 已超限，本次应静默跳过
 */
export async function overTrackLimit(db, ip, kind, limit = TRACK_LIMIT_PER_MINUTE) {
  const bucket = `${kind}-${minuteBucket()}`
  // 单条原子计数：INSERT ... ON CONFLICT ... RETURNING count
  // （先 SELECT 再 UPDATE 在 D1 读写分离下会读到旧值 → 突发连打漏限）
  const row = await db
    .prepare(
      `INSERT INTO track_limits (ip, bucket, count) VALUES (?, ?, 1)
       ON CONFLICT(ip, bucket) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(ip || 'unknown', bucket)
    .first()
  const next = row && Number.isFinite(Number(row.count)) ? Number(row.count) : 1
  if (next === 1) await cleanupTrackLimits(db, kind)
  return next > limit
}

/**
 * 计数 +1 并重算 heat_score（两步批处理，避免 SQLite ON CONFLICT 内互相引用旧值）
 * site_stats 行可能不存在（新站点）→ 首次 INSERT
 */
export async function bumpSiteStat(db, siteId, kind) {
  const column = KIND_COLUMN[kind]
  if (!column) return
  const initialHeat = kind === 'favorite' ? FAVORITE_WEIGHT : 1
  await db.batch([
    db
      .prepare(
        `INSERT INTO site_stats (site_id, ${column}, heat_score, updated_at)
         VALUES (?, 1, ?, datetime('now'))
         ON CONFLICT(site_id) DO UPDATE SET ${column} = ${column} + 1, updated_at = datetime('now')`,
      )
      .bind(siteId, initialHeat),
    db
      .prepare(
        `UPDATE site_stats
         SET heat_score = favorite_count * ? + click_count, updated_at = datetime('now')
         WHERE site_id = ?`,
      )
      .bind(FAVORITE_WEIGHT, siteId),
  ])
}

/**
 * 计数按 delta 增减并重算 heat_score（M9 收藏取消 -1 用）：
 * ${column} = MAX(0, ${column} + delta) 防负——M4 上报只增不减，历史 favorite_count 可能被高估，
 * 不回溯；新逻辑从当前值起正确增减即可。site_stats 行不存在时按 delta 落初始行（负数归 0）。
 */
export async function bumpSiteStatDelta(db, siteId, kind, delta) {
  const column = KIND_COLUMN[kind]
  if (!column || !Number.isInteger(delta) || delta === 0) return
  const initial = delta > 0 ? delta : 0
  await db.batch([
    db
      .prepare(
        `INSERT INTO site_stats (site_id, ${column}, heat_score, updated_at)
         VALUES (?, ?, 0, datetime('now'))
         ON CONFLICT(site_id) DO UPDATE SET
           ${column} = MAX(0, ${column} + ?), updated_at = datetime('now')`,
      )
      .bind(siteId, initial, delta),
    db
      .prepare(
        `UPDATE site_stats
         SET heat_score = favorite_count * ? + click_count, updated_at = datetime('now')
         WHERE site_id = ?`,
      )
      .bind(FAVORITE_WEIGHT, siteId),
  ])
}

/**
 * 上报接口通用处理（click / favorite 共用）
 * @param {Request} request
 * @param {object} env
 * @param {'click'|'favorite'} kind
 * @param {(body:object)=>string} extract 从请求体取匹配键（url / name）
 * @returns {Promise<Response>} 恒为 200 {ok:true}（除同源 403 与数据库异常）
 */
export async function handleTrack(request, env, kind, extract) {
  if (!isSameOriginRequest(request, request.url)) return sameOriginDenied(request)
  const db = getDb(env)
  const body = await readJson(request)
  const limited = await overTrackLimit(db, clientIp(request), kind)
  if (limited) return ok({ counted: false, limited: true }, request)
  const key = body ? extract(body) : ''
  if (!key) return ok({ counted: false }, request)
  // 匹配：url 容错结尾斜杠（rtrim 双侧去 '/'，否则 a.com 与 a.com/ 会漏报）；name 精确匹配
  const site =
    kind === 'click'
      ? await db
          .prepare(`SELECT id FROM sites WHERE rtrim(url, '/') = rtrim(?, '/') LIMIT 1`)
          .bind(key)
          .first()
      : await db.prepare(`SELECT id FROM sites WHERE name = ? LIMIT 1`).bind(key).first()
  if (!site) return ok({ counted: false }, request)
  await bumpSiteStat(db, site.id, kind)
  return ok({ counted: true }, request)
}
