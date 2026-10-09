-- M4 每日 UV 访问统计 + 埋点限频（幂等，可重复执行）

-- 每日 UV：同一 (日期, 访客) 只一行，天然去重
CREATE TABLE IF NOT EXISTS daily_visits (
  visit_date TEXT NOT NULL,          -- YYYY-MM-DD（UTC）
  visitor_id TEXT NOT NULL,          -- 匿名 cookie fv_id（uuid，无个人信息）
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (visit_date, visitor_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_visits_date ON daily_visits(visit_date);

-- 埋点限频（防刷基础版）：按 IP × 时间桶
CREATE TABLE IF NOT EXISTS track_limits (
  ip TEXT NOT NULL,
  bucket TEXT NOT NULL,              -- 'click'|'favorite'|'visit' + 分钟桶 YYYY-MM-DD-HH24-MI（UTC）
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, bucket)
);
CREATE INDEX IF NOT EXISTS idx_track_limits_bucket ON track_limits(bucket);
