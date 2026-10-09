-- M3 链接存活检测：检测日志表（幂等，可重复执行）
CREATE TABLE IF NOT EXISTS check_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ok INTEGER NOT NULL,               -- 0 | 1
  status_code INTEGER,               -- 0 = 网络错误/超时
  duration_ms INTEGER,
  note TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_check_logs_site ON check_logs(site_id, checked_at DESC);
