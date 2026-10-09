-- 食光导航 · D1 迁移 002：管理面板（M2）
-- 依据：dev-docs/tasks/task-9 - M2 管理面板 T1.md §1
-- 幂等：CREATE TABLE IF NOT EXISTS，本地与远程均可重复执行

-- 登录失败锁定（按 IP）：连续 5 次密码错误 → locked_until = now + 10 分钟
CREATE TABLE IF NOT EXISTS admin_attempts (
  ip TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
