-- M9-T4 检测防重锁升级：check_lock 表（task-22）
-- 变更：新增 check_lock 单行锁表，替代 globalThis 内存锁（跨 isolate 不互斥）。
--       cron Worker 与手动 /api/check/run 通过 D1 原子条件更新互斥，避免并发双跑。
-- 幂等：CREATE TABLE IF NOT EXISTS，可重复执行（重跑 0 变更）。

CREATE TABLE IF NOT EXISTS check_lock (
  key TEXT PRIMARY KEY,
  until INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
