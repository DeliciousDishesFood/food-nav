import { errorResponse, fail, ok } from '../_lib/response.js'
import { getDb } from '../_lib/db.js'
import { authGuard } from '../_lib/auth.js'
import { readJson } from '../_lib/validate.js'
import { releaseCheckLock, runChecks, skippedSiteIds, tryAcquireCheckLock } from '../_lib/checker.js'

/**
 * POST /api/check/run（Bearer 鉴权）
 * body: { siteId?: number, batch?: number, since?: number }
 *  - 不传 siteId → 全量（status=active|checking|broken，broken 纳入候选 = 复活机制），
 *                  按 last_checked_at 最久优先，单轮最多 10 站
 *  - 传 siteId   → 只检测该站（broken 站点也能被单站检测救回）；
 *                  若该站 skip_check=1（M9-T3 豁免）→ 不检测，回 {skipped:true, skippedIds:[id]}
 *  - 传 since    → 本次检测起跑时间（毫秒）：只检“自 since 起还没检过”的站，
 *                  remaining 表示还差几站，循环到 remaining=0 即整轮跑完
 *  - 豁免站（skip_check=1）不会进任何候选（pickTargets 全路径排除）
 *  - 同一时刻只允许一个检测任务（M9-T4 D1 原子锁跨 isolate 互斥），触发 → 429 check_in_progress
 */
export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const denied = await authGuard(request, env)
    if (denied) return denied
    const db = getDb(env)

    const body = (await readJson(request)) || {}
    const options = {}
    let siteIds = null
    if (body.siteId !== undefined && body.siteId !== null && body.siteId !== '') {
      const id = Number(body.siteId)
      if (!Number.isInteger(id) || id <= 0) {
        return fail('validation_error', 'siteId 必须是正整数', request, 400)
      }
      siteIds = [id]
    }
    if (body.batch !== undefined && body.batch !== null && body.batch !== '') {
      const batch = Number(body.batch)
      if (!Number.isInteger(batch) || batch < 1 || batch > 4) {
        return fail('validation_error', 'batch 必须是 1-4 的整数', request, 400)
      }
      options.batch = batch
    }
    if (body.since !== undefined && body.since !== null && body.since !== '') {
      const since = Number(body.since)
      if (!Number.isFinite(since) || since <= 0) {
        return fail('validation_error', 'since 必须是毫秒时间戳', request, 400)
      }
      options.since = since
    }

    // M9-T3：单站检测命中豁免站 → 不进队列、不写状态，直接回 {skipped:true}
    let skippedIds = []
    if (siteIds) {
      skippedIds = await skippedSiteIds(db, siteIds)
      if (skippedIds.length === siteIds.length) {
        return ok(
          {
            checked: 0,
            active: 0,
            broken: 0,
            checking: 0,
            errors: 0,
            total: 0,
            remaining: 0,
            elapsedMs: 0,
            batch: options.batch || 4,
            results: [],
            skipped: true,
            skippedIds,
          },
          request,
        )
      }
    }

    // M9-T4：D1 原子锁跨 isolate 互斥（cron Worker 与手动检测不双跑）
    if (!(await tryAcquireCheckLock(db))) {
      return fail('check_in_progress', '已有检测任务进行中，请稍后再试', request, 429)
    }
    try {
      const summary = await runChecks(db, { ...options, siteIds })
      if (siteIds && summary.total === 0) {
        return fail('not_found', '站点不存在', request, 404)
      }
      if (skippedIds.length) summary.skippedIds = skippedIds
      return ok(summary, request)
    } finally {
      await releaseCheckLock(db)
    }
  } catch (error) {
    return errorResponse(error, request)
  }
}
