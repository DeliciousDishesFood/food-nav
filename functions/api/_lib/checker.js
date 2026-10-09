/**
 * M3/M4 链接存活检测核心（被 /api/check/run 与 cron Worker 共用，不依赖 HTTP 层）
 * M9-T4：CHECK_TIMEOUT_MS 8s（降边缘慢站超时误判）+ D1 原子锁跨 isolate 互斥。
 *
 * 检测策略
 *  - HEAD 优先（省流量）；HEAD 没拿到 2xx/3xx（含 405/501/404/403/5xx、超时、网络错误）
 *    一律退回 GET（带 Range: bytes=0-0 只取头）复检，避免“HEAD 被 WAF 挡、GET 正常”的误杀
 *  - UA 伪装成 Chrome 桌面版（M4）：反爬站点对 Workers 默认 UA / 自述爬虫 UA 拒绝率高
 *  - 单站超时 8000ms（AbortController，M9-T4 调高降低边缘慢站误判），一次 HEAD + 一次 GET = 最坏 16s
 *  - 并发 ≤ 4，单轮最多 maxSites 站 + timeBudgetMs 时间预算（保证单轮 < 30s）
 *
 * 分级规则（M9-T2 分级修正，见 task-18 §1）
 *  - 有 HTTP 响应 = 站点可达（浏览器用户能打开就不是死链）：
 *      2xx/3xx → active；4xx（除 404/410/451）→ active；5xx（500-511 等普通降级）→ active
 *      —— 403 反爬、503 服务降级都只标注 note，fail_count 清零，一律不判死
 *      （例外见下：520-527 / 530 属边缘「源站不可达」，不算可达）
 *  - 429     → 可访问但被限流：状态与 fail_count 均不变（不计失败）
 *  - 判死只有两类，连续 BREAK_AFTER_FAILS(2) 次（保持 M3 语义）：
 *      · 页面消失：404 / 410 / 451（页面确实没了）
 *      · 网络层失败：statusCode=0（DNS/TCP/TLS 失败、超时、证书错误）、
 *                    Cloudflare 边缘/源站错误 520-527 与 530（边缘应答但源站不可达，
 *                    浏览器同样看到错误页），首败 status=checking
 *  - 恢复有响应 → active 清零；broken 站点在 pickTargets 候选内（cron/全量重测可自动复活）
 *
 * 豁免机制（M9-T3，见 task-21）
 *  - sites.skip_check = 1 的站点由管理员手动维护：pickTargets 三条路径（siteIds / since / 默认）
 *    一律 `AND skip_check = 0` 排除 → cron、手动全量、单站检测都不会碰豁免站；
 *  - 单站检测命中豁免站时 run.js 返回 {skipped:true, skippedIds:[…]} 提示，不写状态、不写日志；
 *  - 豁免站状态恒为 active（除非管理员在表单里手动改），fail_count 不再累计。
 */

/** 与真实 Chrome 桌面浏览器一致的 UA（反爬站点对 Workers 默认 UA 高度敏感） */
export const CHECK_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
export const CHECK_TIMEOUT_MS = 8000
/** 并发上限（任务硬性要求：并发 ≤ 4） */
export const MAX_CONCURRENCY = 4
export const DEFAULT_CONCURRENCY = 4
/** 单轮最多检测站数（超出留给下一轮：remaining > 0） */
export const DEFAULT_MAX_SITES = 10
/** 单轮时间预算：18s + 单站最坏 16s < 30s */
export const DEFAULT_TIME_BUDGET_MS = 18000
/** 日志保留天数（每次运行前清理） */
export const LOG_RETENTION_DAYS = 30
/** 确定性失败连续多少次判死 */
export const BREAK_AFTER_FAILS = 2

/** 确定性失败码：页面确实没了（只有这类 HTTP 状态判死） */
const DETERMINISTIC_CODES = new Set([404, 410, 451])
/**
 * Cloudflare 边缘/源站错误码：边缘能应答、源站不可达（526 证书无效 / 530 源站 DNS 挂），
 * 浏览器打开同样是错误页 → 归入网络层失败档，不按「有响应=可达」复活
 */
const EDGE_DOWN_CODES = new Set([520, 521, 522, 523, 524, 525, 526, 527, 530])

const LOCK_TTL_MS = 60 * 1000

/**
 * M9-T4 D1 原子防重锁（跨 isolate 互斥：cron Worker 与手动 /api/check/run 不会并发双跑）
 * 拿锁：INSERT … ON CONFLICT DO UPDATE … WHERE until < ? 原子条件更新；
 *       带 RETURNING，0 行 = 存在未过期活跃锁 → false，≥1 行 = 拿锁成功 → true
 * 释放：DELETE 对应 key；TTL 60s 内未释放会自然过期
 * 兜底：D1 异常时放行（不因锁故障阻塞检测）
 * @param {{prepare:function}} db D1
 */
export async function tryAcquireCheckLock(db) {
  const now = Date.now()
  try {
    const { results } = await db
      .prepare(
        `INSERT INTO check_lock (key, until, updated_at) VALUES ('check', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET until = excluded.until, updated_at = datetime('now')
         WHERE check_lock.until < ?
         RETURNING until`,
      )
      .bind(now + LOCK_TTL_MS, now)
      .all()
    return results && results.length > 0
  } catch {
    return true // 锁故障放行
  }
}

export async function releaseCheckLock(db) {
  try {
    await db.prepare(`DELETE FROM check_lock WHERE key = 'check'`).run()
  } catch {
    /* 释放失败不影响主流程，TTL 过期兜底 */
  }
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

function normalizeIds(siteIds) {
  if (!Array.isArray(siteIds)) return null
  const ids = siteIds
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .slice(0, 20)
  return ids.length ? ids : null
}

/** epoch 毫秒 → SQLite 时间串（UTC，'YYYY-MM-DD HH:MM:SS.mmm'，与 strftime('%f') 同格式） */
function toSqliteMs(ms) {
  const date = new Date(ms)
  const pad = (value, width = 2) => String(value).padStart(width, '0')
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.` +
    pad(date.getUTCMilliseconds(), 3)
  )
}

function abortError(error) {
  return error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

/** 发起一次请求，超时/网络错误一律归一为 statusCode 0 */
async function fetchOnce(url, method, timeoutMs, extraHeaders) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()
  try {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': CHECK_UA,
        accept: '*/*',
        ...(extraHeaders || {}),
      },
    })
    if (response.body) {
      try {
        await response.body.cancel()
      } catch {
        /* 只要状态行，body 已弃用 */
      }
    }
    return { statusCode: response.status, durationMs: Date.now() - startedAt }
  } catch (error) {
    const timedOut = abortError(error)
    return {
      statusCode: 0,
      durationMs: Date.now() - startedAt,
      timedOut,
      errorMessage: String((error && error.message) || error),
    }
  } finally {
    clearTimeout(timer)
  }
}

function failureNote(result, timeoutMs) {
  if (result.timedOut) return `timeout ${timeoutMs}ms`
  return `network error: ${result.errorMessage || 'unknown'}`
}

/**
 * 检测单个 URL
 *  HEAD 拿到 2xx/3xx → 直接判定；
 *  其余情况（405/501、404/403 等 4xx/5xx、超时、网络错误）→ 退回 GET 取真实状态
 *  （实测 www.starbucks.com.cn 对 HEAD 回 404、对 GET 回 206，必须退回 GET 才不误杀）
 * @returns {Promise<{ok:boolean,statusCode:number,durationMs:number,method:string,note:string}>}
 *  statusCode 0 = 超时/网络错误；ok = 最终状态码 < 400
 */
export async function checkOne(url, options = {}) {
  const timeoutMs = clampInt(options.timeoutMs, 500, 30000, CHECK_TIMEOUT_MS)
  let target
  try {
    target = new URL(typeof url === 'string' ? url : '')
  } catch {
    return { ok: false, statusCode: 0, durationMs: 0, method: 'none', note: 'invalid url' }
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { ok: false, statusCode: 0, durationMs: 0, method: 'none', note: 'invalid url' }
  }

  const head = await fetchOnce(target.href, 'HEAD', timeoutMs)
  if (head.statusCode >= 200 && head.statusCode < 400) {
    return {
      ok: true,
      statusCode: head.statusCode,
      durationMs: head.durationMs,
      method: 'HEAD',
      note: `HTTP ${head.statusCode}`,
    }
  }

  const headNote = head.statusCode
    ? `HEAD ${head.statusCode}`
    : `HEAD ${failureNote(head, timeoutMs)}`
  const get = await fetchOnce(target.href, 'GET', timeoutMs, { range: 'bytes=0-0' })
  if (get.statusCode === 0) {
    return {
      ok: false,
      statusCode: 0,
      durationMs: head.durationMs + get.durationMs,
      method: 'GET',
      note: `${failureNote(get, timeoutMs)}，${headNote}`,
    }
  }
  return {
    ok: get.statusCode < 400,
    statusCode: get.statusCode,
    durationMs: head.durationMs + get.durationMs,
    method: 'GET',
    note: `HTTP ${get.statusCode}（GET，${headNote}）`,
  }
}

/**
 * 单次检测结果 → 分级决策（M9-T2：有响应 = 可达，只有页面消失/网络不可达判死）
 * @returns {{logOk:0|1, failMode:'reset'|'keep'|'increment',
 *   status:'active'|'checking'|null, breakAfter:number, note:string}}
 */
export function gradeResult(result) {
  const code = result.statusCode
  const baseNote = result.note || ''
  // 网络层失败（DNS/TCP/TLS、超时、证书错误）：确定性档，首败弱信号先落 checking，连续 2 次判死
  if (!code) {
    return {
      logOk: 0,
      failMode: 'increment',
      status: 'checking',
      breakAfter: BREAK_AFTER_FAILS,
      note: `${baseNote}（网络层不可达，连续 ${BREAK_AFTER_FAILS} 次判失效）`,
    }
  }
  if (code === 429) {
    return {
      logOk: 1,
      failMode: 'keep',
      status: null,
      breakAfter: BREAK_AFTER_FAILS,
      note: `${baseNote}（限流，不计失败）`,
    }
  }
  // 页面确实没了：404/410/451，连续 2 次判死
  if (DETERMINISTIC_CODES.has(code)) {
    return {
      logOk: 0,
      failMode: 'increment',
      status: null,
      breakAfter: BREAK_AFTER_FAILS,
      note: `${baseNote}（页面已消失，连续 ${BREAK_AFTER_FAILS} 次判失效）`,
    }
  }
  // Cloudflare 边缘/源站错误：源站实际不可达 → 按网络层失败计（首败 checking）
  if (EDGE_DOWN_CODES.has(code)) {
    return {
      logOk: 0,
      failMode: 'increment',
      status: 'checking',
      breakAfter: BREAK_AFTER_FAILS,
      note: `${baseNote}（Cloudflare 边缘错误，源站不可达，连续 ${BREAK_AFTER_FAILS} 次判失效）`,
    }
  }
  // 其余有响应的状态码 = 站点可达（403 反爬 / 5xx 降级 / 999 等）
  if (code >= 400) {
    const suffix =
      code === 403
        ? '反爬拦截但站点可达'
        : code >= 500 && code < 600
          ? '服务降级但站点可达'
          : '站点可达'
    return {
      logOk: 1,
      failMode: 'reset',
      status: 'active',
      breakAfter: BREAK_AFTER_FAILS,
      note: `${baseNote}（${suffix}）`,
    }
  }
  // 2xx / 3xx（含重定向最终态）
  return {
    logOk: 1,
    failMode: 'reset',
    status: 'active',
    breakAfter: BREAK_AFTER_FAILS,
    note: baseNote,
  }
}

function applyFailMode(currentFail, mode) {
  if (mode === 'reset') return 0
  if (mode === 'keep') return currentFail
  return currentFail + 1
}

function resolveStatus(currentStatus, verdict, newFail) {
  const breakAfter = verdict.breakAfter || BREAK_AFTER_FAILS
  // keep（如 429 限流）：状态与计数都不动，不参与判死判定
  if (verdict.failMode !== 'keep' && newFail >= breakAfter) return 'broken'
  if (verdict.status) return verdict.status
  return currentStatus || 'active'
}

/**
 * 单次检测结果叠加到站点状态（gradeResult → fail_count → status，纯函数）
 * runChecks 与分级单测共用，保证测试断言的就是线上执行的同一套逻辑
 * @param {{status?:string, fail_count?:number}} site 当前站点状态
 * @param {{statusCode:number, note?:string}} result 单次检测结果
 * @returns {{verdict:ReturnType<typeof gradeResult>, failCount:number, status:string}}
 */
export function nextSiteState(site, result) {
  const verdict = gradeResult(result)
  const failCount = applyFailMode((site && site.fail_count) || 0, verdict.failMode)
  const status = resolveStatus(site && site.status, verdict, failCount)
  return { verdict, failCount, status }
}

const TARGET_COLUMNS = 'id, name, url, status, fail_count'

/** 全量检测候选状态：**含 broken**（M9-T2 复活机制——判死后仍会被 cron/全量重测，恢复即自动复活） */
const TARGET_STATUSES = `('active', 'checking', 'broken')`

/**
 * 挑选本轮检测目标
 *  - siteIds（手动单站）：不过滤 status，broken 站可被单站检测救回
 *  - since / 默认（cron 与手动全量）：active + checking + broken 全量纳入，
 *    按 last_checked_at 最久未检优先（broken 也会被挑到重测 → 自动复活）
 *  - 三条路径都排除 skip_check = 1（M9-T3 豁免站：cron / 全量 / 单站均不参与）
 *  @param {{prepare:function}} db D1 或 mock
 */
export async function pickTargets(db, siteIds, sinceSql) {
  if (siteIds) {
    const placeholders = siteIds.map(() => '?').join(',')
    const { results } = await db
      .prepare(
        `SELECT ${TARGET_COLUMNS} FROM sites WHERE id IN (${placeholders}) AND skip_check = 0 ORDER BY id ASC`,
      )
      .bind(...siteIds)
      .all()
    return results || []
  }
  if (sinceSql) {
    // 本次操作（同一起跑时间 since）还没检过的站点，保证多轮循环能收敛到 0
    const { results } = await db
      .prepare(
        `SELECT ${TARGET_COLUMNS} FROM sites
         WHERE status IN ${TARGET_STATUSES}
           AND skip_check = 0
           AND (last_checked_at IS NULL OR last_checked_at < ?)
         ORDER BY (last_checked_at IS NULL) DESC, last_checked_at ASC, id ASC`,
      )
      .bind(sinceSql)
      .all()
    return results || []
  }
  const { results } = await db
    .prepare(
      `SELECT ${TARGET_COLUMNS} FROM sites
       WHERE status IN ${TARGET_STATUSES}
         AND skip_check = 0
       ORDER BY (last_checked_at IS NULL) DESC, last_checked_at ASC, id ASC`,
    )
    .all()
  return results || []
}

/**
 * 从给定 id 中挑出豁免站（skip_check = 1）的 id 列表（M9-T3）
 * 供 /api/check/run 单站检测返回 {skipped:true} 语义；不存在的 id 不会返回
 */
export async function skippedSiteIds(db, siteIds) {
  const ids = normalizeIds(siteIds)
  if (!ids) return []
  const placeholders = ids.map(() => '?').join(',')
  const { results } = await db
    .prepare(`SELECT id FROM sites WHERE id IN (${placeholders}) AND skip_check = 1 ORDER BY id ASC`)
    .bind(...ids)
    .all()
  return (results || []).map((row) => row.id)
}

/** 清理超过保留期的日志（每次检测运行执行一次） */
export async function cleanupOldLogs(db) {
  await db
    .prepare(`DELETE FROM check_logs WHERE checked_at < strftime('%Y-%m-%d %H:%M:%f', 'now', ?)`)
    .bind(`-${LOG_RETENTION_DAYS} days`)
    .run()
}

/**
 * 执行一轮检测
 * @param {D1Database} db
 * @param {{siteIds?:number[], since?:number, batch?:number, maxSites?:number, timeBudgetMs?:number, timeoutMs?:number}} options
 *   since：本次检测操作的起跑时间（epoch 毫秒）。传了之后只检“自 since 起还没检过”的站点，
 *          remaining 就是还差多少站没覆盖 → 调用方循环到 remaining=0 即跑完整轮；
 *          不传则单轮最多检 maxSites 站（remaining = total - checked）。
 * @returns {Promise<{checked:number,active:number,broken:number,checking:number,errors:number,
 *   total:number,remaining:number,elapsedMs:number,batch:number,results:Array}>}
 */
export async function runChecks(db, options = {}) {
  const startedAt = Date.now()
  const concurrency = clampInt(options.batch, 1, MAX_CONCURRENCY, DEFAULT_CONCURRENCY)
  const maxSites = clampInt(options.maxSites, 1, 200, DEFAULT_MAX_SITES)
  const timeBudgetMs = clampInt(options.timeBudgetMs, 1000, 25000, DEFAULT_TIME_BUDGET_MS)
  const timeoutMs = clampInt(options.timeoutMs, 500, 30000, CHECK_TIMEOUT_MS)
  const siteIds = normalizeIds(options.siteIds)
  const sinceValue = Number(options.since)
  const sinceSql = Number.isFinite(sinceValue) && sinceValue > 0 ? toSqliteMs(sinceValue) : null

  const targets = await pickTargets(db, siteIds, sinceSql)
  const queue = targets.slice(0, maxSites)

  const summary = {
    checked: 0,
    active: 0,
    broken: 0,
    checking: 0,
    errors: 0,
    total: targets.length,
    remaining: targets.length,
    elapsedMs: 0,
    batch: concurrency,
    results: [],
  }

  async function processSite(site) {
    try {
      const result = await checkOne(site.url, { timeoutMs })
      const { verdict, failCount: newFail, status: newStatus } = nextSiteState(site, result)
      await db.batch([
        db
          .prepare(
            // 毫秒精度：全量检测靠 last_checked_at 最久未检优先来分批，
            // 秒级时间戳会让同一秒内的站点互相并列，导致每轮都挑同一批（实测卡死）
            `UPDATE sites SET status = ?, fail_count = ?, last_checked_at = strftime('%Y-%m-%d %H:%M:%f', 'now'), updated_at = datetime('now') WHERE id = ?`,
          )
          .bind(newStatus, newFail, site.id),
        db
          .prepare(
            `INSERT INTO check_logs (site_id, ok, status_code, duration_ms, note, checked_at)
             VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))`,
          )
          .bind(site.id, verdict.logOk, result.statusCode, result.durationMs, verdict.note),
      ])
      summary.checked += 1
      if (summary[newStatus] !== undefined) summary[newStatus] += 1
      if (summary.results.length < 50) {
        summary.results.push({
          id: site.id,
          name: site.name,
          url: site.url,
          status: newStatus,
          ok: verdict.logOk === 1,
          statusCode: result.statusCode,
          durationMs: result.durationMs,
          note: verdict.note,
        })
      }
    } catch {
      summary.errors += 1
    }
  }

  let cursor = 0
  const worker = async () => {
    for (;;) {
      if (Date.now() - startedAt > timeBudgetMs) return
      const index = cursor
      cursor += 1
      if (index >= queue.length) return
      await processSite(queue[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, () => worker()),
  )

  await cleanupOldLogs(db)

  summary.remaining = Math.max(0, summary.total - summary.checked)
  summary.elapsedMs = Date.now() - startedAt
  return summary
}
