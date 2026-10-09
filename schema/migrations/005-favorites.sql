-- M9 收藏服务端化：访客 × 站点 收藏表
-- 联合主键 (visitor_id, site_id)：同一访客重复收藏天然幂等（INSERT OR IGNORE → changes=0 → 不重复计数）
CREATE TABLE IF NOT EXISTS favorites (
  visitor_id  TEXT    NOT NULL,
  site_id     INTEGER NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (visitor_id, site_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_site ON favorites (site_id);
