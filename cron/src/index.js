/**
 * M3 链接检测 cron Worker（独立于 Pages，Pages Functions 不支持 scheduled）
 * 每天 UTC 04:00 触发：内部直调 runChecks（不走 HTTP、不鉴权），
 * 多轮循环直到全部站点检完（remaining=0）或达到时间上限。
 * M9-T2：候选含 broken → 判死站点每天重测，网络层恢复即自动复活（403/5xx 判定也已放宽为可达）。
 * M9-T4：D1 原子锁跨 isolate 互斥——手动 /api/check/run 持锁时 cron 跳过本轮，反之亦然。
 */
import { getDb } from '../../functions/api/_lib/db.js'
import { runChecks, tryAcquireCheckLock, releaseCheckLock } from '../../functions/api/_lib/checker.js'

/** 单次 cron 最多轮数（每轮 ≤10 站 / ≤18s） */
const MAX_ROUNDS = 6
/** 整个 cron 事件的时间上限，留出余量避免被平台中断 */
const CRON_TIME_BUDGET_MS = 45000

export default {
  async scheduled(controller, env) {
    const startedAt = Date.now()
    const db = getDb(env)
    let rounds = 0
    let checked = 0
    let errors = 0
    let remaining = 0
    let tally = null

    // M9-T4：D1 锁——手动检测进行中则本次 cron 跳过（跨 Worker 实例互斥）
    if (!(await tryAcquireCheckLock(db))) {
      console.log(
        JSON.stringify({
          event: 'link-check-cron',
          skipped: 'check_in_progress',
          elapsedMs: Date.now() - startedAt,
        }),
      )
      return
    }
    try {
      while (rounds < MAX_ROUNDS && Date.now() - startedAt < CRON_TIME_BUDGET_MS) {
        const summary = await runChecks(db, {
          since: startedAt,
          batch: 4,
          maxSites: 10,
          timeBudgetMs: 18000,
        })
        rounds += 1
        checked += summary.checked
        errors += summary.errors
        remaining = summary.remaining
        tally = {
          active: summary.active,
          broken: summary.broken,
          checking: summary.checking,
        }
        if (summary.checked === 0 || summary.remaining === 0) break
      }
    } finally {
      await releaseCheckLock(db)
    }

    console.log(
      JSON.stringify({
        event: 'link-check-cron',
        cron: controller && controller.cron,
        rounds,
        checked,
        errors,
        remaining,
        tally,
        elapsedMs: Date.now() - startedAt,
      }),
    )
  },
}
