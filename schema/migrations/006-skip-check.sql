-- M9-T3 检测豁免机制 + 死链治理（task-21）
-- 变更：sites 新增 skip_check（豁免站 cron / 全量 / 单站检测均不参与）；
--       删除 2 个真死链站点 id 9/10 并级联清理关联表；插入 2 个替代新站 id 29/30
--       （任务卡原写 28/29，执行前 SELECT MAX(id) 发现线上 id 28 已被「本地生活」占用 → 按任务卡
--         「冲突则顺延」规则改为 29/30）；
--       id 8 Tinrry 甜悦家（浏览器可达、边缘检测失败）→ 豁免 + 恢复 active + fail_count 清零。
--
-- 幂等说明（SQLite 限制，见任务卡坑点 1）：
--   · 第 1 条语句 `ALTER TABLE sites ADD COLUMN` 是一次性 DDL：SQLite 无 ADD COLUMN IF NOT EXISTS，
--     重跑会报 `duplicate column name: skip_check` 并在首句中止 —— 中止发生在任何数据语句之前，
--     库内数据零变更（安全失败）。已存在该列时请跳过第 1 条语句，只执行下方数据段。
--   · 数据段全部天然幂等：DELETE 命中 0 行、INSERT … WHERE NOT EXISTS 命中 0 行、
--     UPDATE … 条件不满足 → 0 变更，可重复执行。

-- ---------- 1. schema：站点表加跳过检测标记 ----------
ALTER TABLE sites ADD COLUMN skip_check INTEGER NOT NULL DEFAULT 0;

-- ---------- 2. 删除 2 个真死链站点（按依赖序级联清理：收藏 → 统计 → 检测日志 → 站点） ----------
DELETE FROM favorites  WHERE site_id IN (9, 10);
DELETE FROM site_stats WHERE site_id IN (9, 10);
DELETE FROM check_logs  WHERE site_id IN (9, 10);
DELETE FROM sites       WHERE id IN (9, 10);

-- ---------- 3. 替代新站 2 个（显式 id 29/30，status=active，不自动打标 tag=''） ----------
INSERT INTO sites
  (id, category_id, name, desc, url, icon, cover_img, tag, sort_order, status, fail_count, skip_check, created_at, updated_at)
SELECT 29, 2, '美食天下', '中文美食菜谱社区，家常菜与烘焙甜品栏目丰富', 'https://www.meishichina.com/',
       'chef-hat', '/covers/dessert.svg', '', 3, 'active', 0, 0, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM sites WHERE id = 29);

INSERT INTO sites
  (id, category_id, name, desc, url, icon, cover_img, tag, sort_order, status, fail_count, skip_check, created_at, updated_at)
SELECT 30, 2, '好豆网', '美食菜谱分享社区，家常菜与甜品做法齐全', 'https://www.haodou.com/',
       'cookie', '/covers/cake.svg', '', 4, 'active', 0, 0, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM sites WHERE id = 30);

INSERT INTO site_stats (site_id, favorite_count, click_count, heat_score)
SELECT v.site_id, 0, 0, 0
FROM (SELECT 29 AS site_id UNION ALL SELECT 30) AS v
WHERE NOT EXISTS (SELECT 1 FROM site_stats st WHERE st.site_id = v.site_id);

-- ---------- 4. Tinrry 甜悦家：管理员手动豁免（检测视角 ≠ 用户视角） ----------
UPDATE sites
   SET skip_check = 1, status = 'active', fail_count = 0, updated_at = datetime('now')
 WHERE id = 8
   AND (skip_check IS NOT 1 OR status <> 'active' OR fail_count <> 0);
