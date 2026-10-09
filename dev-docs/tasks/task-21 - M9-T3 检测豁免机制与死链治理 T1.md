# task-21 · M9-T3 检测豁免机制 + 死链治理 T1

> 生成：2026-10-08 22:30 · 副参谋（用户反馈 tinrry 浏览器可达 → 暴露"检测视角≠用户视角"问题）
> 前置必读：`dev-docs/STATUS.md`、task-18（M9-T2 分级）、`functions/api/_lib/checker.js`、`functions/api/_lib/db.js`、`functions/api/sites.js`、`src/admin/SiteForm.jsx`、`src/admin/AdminSites.jsx`、`schema/migrations/`（001-005 参考格式）
> 前置状态：线上 M10，27 站（active 24 / broken 3：tinrry 526 证书边缘无效但用户可达、dessertlab/icecreamplanet DNS 真死）

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\dev-docs\STATUS.md`、本任务文档、`E:\react\food-nav\functions\api\_lib\checker.js`、`functions\api\_lib\db.js`、`functions\api\sites.js`、`src\admin\SiteForm.jsx`、`src\admin\AdminSites.jsx`、`schema\migrations\001-init.sql`（字段/种子格式参考）。

任务：**M9-T3 检测豁免机制 + 死链治理**——
①`schema/migrations/006-skip-check.sql`：sites 加 `skip_check INTEGER NOT NULL DEFAULT 0` + 数据变更（幂等）——删除 id 9（甜品实验室 dessertlab.cn）与 id 10（冰淇淋星球 icecreamplanet.cn）并级联清理关联表；插入 2 个替代新站（美食天下 https://www.meishichina.com、好豆网 https://www.haodou.com，全字段齐全、status='active'、显式 id 续用 28/29）；UPDATE id 8（Tinrry 甜悦家）→ `skip_check=1, status='active', fail_count=0`
②checker.js：`pickTargets` 排除 `skip_check=1`（cron/全量检测都不碰豁免站）；siteIds 单站检测对豁免站跳过并返回提示
③db.js/toSiteDto/sites.js：DTO 加 `skipCheck` 字段（snake→camel）
④admin：SiteForm 加「跳过自动检测」开关（checkbox，提交含 skipCheck）；AdminSites 表格豁免行显示徽标
⑤数据变更后主站应为 **27 站全 active**（删 2 加 2 + tinrry 豁免恢复）

硬约束：主站前端组件零改动（`src/components/**`、`src/pages/**` 不动；仅 admin 前端允许）；verify 52 语义保持（先 grep 是否有 sites 数量/字段断言受影响，有则演进并说明）；零新运行时依赖。

---

## 📋 任务清单

### 1. migration 006（schema + 数据，幂等）

```sql
-- schema
ALTER TABLE sites ADD COLUMN skip_check INTEGER NOT NULL DEFAULT 0;  -- 注意：SQLite 需分两步（ADD COLUMN 后建索引不需要）

-- 数据变更（幂等：显式 id + 条件存在才动）
DELETE FROM favorites      WHERE site_id IN (9, 10);
DELETE FROM site_stats     WHERE site_id IN (9, 10);
DELETE FROM check_logs     WHERE site_id IN (9, 10);
DELETE FROM sites          WHERE id IN (9, 10);

INSERT OR REPLACE INTO sites (id, name, url, icon, cover_img, description, category_key, tags, sort_order, status, fail_count, skip_check, created_at, updated_at)
VALUES (28, '美食天下', 'https://www.meishichina.com', …, '…', '…', 'baking', '…', …, 'active', 0, 0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO sites (…) VALUES (29, '好豆网', 'https://www.haodou.com', …, …, '…', 'baking', …, …, 'active', 0, 0, …);

INSERT OR REPLACE INTO site_stats (site_id, favorite_count, click_count, heat_score) VALUES (28, 0, 0, 0), (29, 0, 0, 0);

UPDATE sites SET skip_check = 1, status = 'active', fail_count = 0, updated_at = datetime('now') WHERE id = 8;
```
- 新站字段参考 001-init.sql 种子格式：`icon`/`cover_img` 用空串或站内默认路径（参考其它站），`category_key` 按两站属性归 `baking`（烘焙甜点）或最接近分类——先查线上 categories 表确认 key 再填；`description` 写真实介绍（美食天下=中文美食菜谱社区，烘焙甜品栏目丰富；好豆网=美食菜谱分享社区，甜品做法齐全）；`tags` 留空或「热门」不给——避免误导（打标是管理员行为）
- 显式 id 28/29：先 `SELECT COALESCE(MAX(id),0)+1 FROM sites` 确认无冲突，冲突则顺延
- 幂等验证：本地执行 2 次无报错、第二次 0 变更

### 2. checker.js 豁免

- `pickTargets`（since 路径 + 默认路径）WHERE 加 `AND skip_check = 0`
- siteIds 路径：若站点 skip_check=1 → 跳过不检测，返回 `{skipped: true}` 语义（或直接不纳入 queue，汇总里 counted 为 skipped）
- 文件头注释更新：M9-T3 豁免机制说明
- 单测补充（t21-grade.mjs 或并入现有）：豁免站不进全量候选 / 豁免站单站检测被跳过

### 3. DTO 字段

- `db.js` SITE_COLUMNS + toSiteDto：`s."skip_check" AS skip_check` → `skipCheck: !!row.skip_check`
- `sites.js` 输出自动带 skipCheck（前端可读，admin 表单回显用）

### 4. admin 豁免开关

- `SiteForm.jsx`：新增「跳过自动检测」checkbox（aria-label="跳过自动检测"，label 说明"该站由管理员手动维护，自动检测不参与"）；提交 payload 含 `skipCheck`；编辑回显
- `AdminSites.jsx`：表格状态列/新增列显示豁免徽标（如「豁免」小标签，token 配色），筛选项不动
- 新建站点时 skipCheck 默认 false

### 5. 部署（migration + cron + pages 必须全部署）

```
npx wrangler d1 execute food-nav-db --remote --file schema/migrations/006-skip-check.sql   # 幂等，确认 27 站全 active
npx wrangler deploy --config cron/wrangler.toml        # checker 改了，必须重部署
npm run build && npx wrangler pages deploy dist --project-name food-nav
```

---

## 🚫 禁止
- 主站前端组件/页面零改动；navSources.js 不动（快照）
- verify 52 语义破坏；零新依赖
- 不自动给新站打标（tags 留空，管理员行为）
- 不打印密钥

## ⚠️ 坑点预警
1. **SQLite ALTER TABLE**：ADD COLUMN 带 DEFAULT 可以一条执行；幂等（重跑会报 duplicate column）→ 迁移用 `INSERT OR REPLACE` 数据幂等 + schema 用 `ALTER TABLE ... ADD COLUMN` 前判断（参考 001-005 的幂等写法；D1 migration 重跑时 ADD COLUMN 会报错 → 任务卡允许用 `PRAGMA table_info` 判断或接受首次执行，执行日志说明）
   - **更稳**：migration 只跑一次（远程 + 本地各一次），幂等性靠数据语句（DELETE/INSERT/UPDATE 天然幂等），schema 语句失败可接受（说明即可）——但 001-005 都是"重复执行 0 rows"风格，保持一致性：用 try 判断（SQLite 无 IF NOT EXISTS for column → 先查 PRAGMA 再决定，或让 OpenCode 用 `ALTER TABLE sites ADD COLUMN skip_check INTEGER NOT NULL DEFAULT 0` 并在第二次执行前确认已存在）
2. **删除级联**：migration SQL 里手动按序删（favorites → site_stats → check_logs → sites）；db.js 的删除辅助函数不受影响
3. **新站插入后立即验证**：插入后跑单站检测（POST /api/check/run {siteId:28/29} 或 checker.checkOne）——若判定非 active（如 meishichina 403 已被新分级判 active 应通过；若 DNS/超时）→ 换备选站（美食杰 https://www.meishij.net、好利来 https://www.holiland.com）重新插入，汇报说明
4. **cron 必须重部署**：checker 在 cron Worker，只 deploy pages 不生效
5. **tinrry 豁免语义**：豁免 = 管理员对"浏览器可达但边缘检测失败"的站负责；豁免后不检测、状态恒 active（除非管理员手动改）——在 admin 表单说明文案讲清楚
6. **verify 影响排查**：grep verify.mjs 是否有 sites 数量断言（如 23 卡片=navSource mock——mock 不动则无影响）、admin 表单断言（加字段后表单提交 payload 变化可能影响 mock 断言）→ 有则演进并在汇报说明
7. **PowerShell 写中文文件损坏 UTF-8** → 源码/SQL 用编辑器工具改

## ✅ 验收与汇报

### 验证命令
```
npm run lint · npm run build · npm run verify      # verify 52（或演进后，说明）
npx wrangler d1 execute food-nav-db --local --file schema/migrations/006-skip-check.sql   # 幂等
node t21-*.mjs（豁免单测：豁免站不进候选 / 单站检测跳过 / 新站检测 active）
```

### 手动验证清单（逐项 ✓/✗）
1. migration 006 本地执行幂等；sites 27 行全 active（查 D1）
2. checker 豁免：全量检测 → 豁免站（id 8）不在 candidates；单站检测 id 8 → 跳过提示
3. admin：登录 → 站点表单编辑 tinrry → 「跳过自动检测」开关已勾选回显；新建站点表单含该开关（默认关）；Sites 表格 tinrry 行显示豁免徽标
4. 新站：美食天下/好豆网插入后单站检测 active（或已换备选）；主站出现两站卡片、描述正确、无破图
5. 主站：27 站全显示（含 tinrry 恢复）、无降级条、搜索/分类/收藏/主题正常
6. 线上部署后：/api/sites?status=active → 27 条；/api/sites?status=all → 27 条 0 broken；tinrry 状态 active + skipCheck=1
7. verify 52（或演进后）· lint 0/0 · build ✓
8. 375 无溢出；暗色 admin 表单/徽标正常

### 汇报格式
1. 改动清单（migration 006 / checker / db / admin / 部署）
2. 验证结果（命令输出 + 清单 8 项逐条）
3. 截图 ≥3 张：01-admin-skip-check（表单开关+豁免徽标）、02-home-27-sites（主站 27 站含 tinrry/美食天下/好豆网）、03-mobile-375（+可选 04-dark）
4. 部署状态：migration 006 远程 + cron 重部署 + pages deploy 记录；线上 27 active 确认
5. 遗留问题与风险
