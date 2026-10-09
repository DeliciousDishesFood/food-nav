# task-10 · M3 链接存活检测（Cron + 检测核心 + 管理面板检测中心）T1

> 生成：2026-10-04 · 副参谋（已评审定稿）
> 前置必读：`dev-docs/STATUS.md`、`dev-docs/architecture/02-backend-design.md`（§四 链接检测）、`03-m1-backend-detail.md`、task-9（admin 模式参考：AdminShell/AdminApi/鉴权）
> 前置状态：M1 ✅、M2 ✅（**本地验证全绿但未部署**——本任务第 0 步先完成 M2 线上部署）

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\dev-docs\STATUS.md`、`E:\react\food-nav\dev-docs\architecture\02-backend-design.md`、`03-m1-backend-detail.md`、本任务文档、`E:\react\food-nav\functions\api\_lib\response.js`、`_lib\db.js`、`_lib\auth.js`、`functions\api\sites.js`、`functions\api\sites\[id].js`、`src\admin\AdminShell.jsx`、`src\admin\AdminDashboard.jsx`、`src\admin\AdminApi.js`、`wrangler.toml`、`tests\verify.mjs`。

任务：**M3 链接存活检测**——① 第 0 步：完成 M2 线上部署（migration 002 远程 + secrets + deploy；**ADMIN_PASSWORD/ADMIN_SECRET 由用户提供**，缺则暂停询问，不擅自设置）② `schema/migrations/003-check.sql`：check_logs 表 ③ `functions/api/_lib/checker.js`：检测核心（HEAD→GET fallback、5s 超时、分级算法、并发 ≤4）④ `functions/api/check/run.js`（POST 鉴权，手动触发全量/单站）+ `functions/api/check/logs.js`（GET 鉴权，日志分页）⑤ Cron 定时入口（`onScheduled`，每天 1 次，走内部调用不走 HTTP 鉴权）⑥ 管理面板「检测中心」页（手动触发 + 日志表）+ 仪表盘统计接真实数据。

硬约束：主站 `src/components/**` 零改动；`navSources.js`/`index.css`/`tailwind.config.js` 不动；verify **45 条语义全保留（不新增）**；检测逻辑在主站无感知（broken 自动被 `/api/sites` 默认过滤，已有）；运行时依赖不新增。

完成后按本文「✅ 验收与汇报」逐项验证并汇报（含 2 张截图）。

---

## ⚠️ 第 0 步：M2 线上部署（前置，先做）

```
npx wrangler d1 execute food-nav-db --remote --file schema/migrations/002-admin.sql
npx wrangler pages secret put ADMIN_PASSWORD --project-name food-nav   # ← 值见启动提示词（对话传递）
npx wrangler pages secret put ADMIN_SECRET   --project-name food-nav   # ← 值见启动提示词（对话传递）
npm run build && npx wrangler pages deploy dist --project-name food-nav
```
部署后验证：`https://food-nav.shiora.cc/admin` 可达、登录可用、CRUD 正常。

> 🔐 **密钥纪律**：`ADMIN_PASSWORD` / `ADMIN_SECRET` 的**真实值只在启动提示词（对话）中提供，禁止写入本任务卡或任何将提交 GitHub 的文件**。本任务卡被提交前，如已含任何密钥占位/明文，先删除再提交。本地 `functions/.dev.vars` 是唯一允许落盘的密钥文件（已 .gitignore）。

---

## 📋 任务清单

### 1. schema/migrations/003-check.sql

```sql
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
```

### 2. functions/api/_lib/checker.js（检测核心）

- `checkOne(url, {timeoutMs=5000, ua})`：
  1. `fetch(url, {method:'HEAD', redirect:'follow', signal: 5s})` → HEAD 405/不允许 → fallback `GET`（`Range: bytes=0-0`）
  2. 返回 `{ok, statusCode, durationMs, note}`
- 分级（写回 sites.status/fail_count/last_checked_at）：
  - 2xx/3xx → `active`，fail_count=0
  - 4xx（**429 不计失败**；403 计失败但需 2 次才标死）→ fail_count+1；≥2 → `broken`
  - 5xx / 超时 / 网络错误 → fail_count+1，status=`checking`（弱信号）；≥2 → `broken`
- `runChecks(db, {siteIds?, batch=4})`：
  - 取目标站点（全量 = `status IN ('active','checking')`；单站 = 指定 id）
  - **并发 ≤4**（手写小并发池，勿 Promise.all 全量）
  - 每站：checkOne → 更新 sites → 写 check_logs（同事务或顺序写）
  - 清理：删除 `checked_at < datetime('now','-30 days')` 的旧日志
  - 返回汇总 `{checked, active, broken, checking, errors}`
- UA：`food-nav-link-check/1.0 (+https://food-nav.shiora.cc)`
- **时长预算**：23 站 × 5s 上限、并发 4 → 最坏 ~30s（Workers 免费 duration 30s）。**若实测超时 → 自动分批**（单次最多 10 站，剩余留到下次触发；手动触发可传 `batch=1` 循环）。如实测量并在汇报中说明实际耗时。

### 3. functions/api/check/（新增，均需鉴权 authGuard）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/check/run` | body `{siteId?}`（空=全量）→ `{ok,data:汇总}`；检测中并发重复触发 → 429 `{code:'check_in_progress'}`（用全局 KV/D1 标记或简单内存标记，注明局限） |
| GET | `/api/check/logs?site_id=&limit=20&offset=0` | 日志列表（含站点名 JOIN sites）→ `{ok,data:{list,total}}` |

### 4. Cron 定时入口（每天 1 次）

- Pages Functions 的 scheduled handler：在 `functions/` 下导出 `onScheduled`（位置/写法以 wrangler/Pages 官方文档为准，任务内实测确认）
- `wrangler.toml` 增加 cron 配置：`crons = ["0 4 * * *"]`（UTC，即北京时间 12:00）
- onScheduled 内：直接调 `runChecks(env.DB)`（不经 HTTP、不鉴权——Cron 是 Cloudflare 内部触发）
- **本地验证 cron**：`wrangler pages dev` 下用 `--cron` 参数触发测试（实测命令），或直接调 runChecks 逻辑

### 5. 管理面板「检测中心」

- 新增 `src/admin/AdminChecks.jsx`：手动触发按钮（全量）+ 最近 30 条日志表（时间/站点/状态码/耗时/备注）+ 单站检测入口（站点表格行内可选「检测此站」——可选，若简单则做）
- `AdminShell.jsx` Tab 增加「检测中心」
- `AdminApi.js` 增加：`runCheck(siteId?)` / `fetchCheckLogs(params)`
- `AdminDashboard.jsx`：失效数（sites.status='broken' 计数）、最近检测时间（sites.max(last_checked_at)）接真实数据（dashboard 现有统计若为占位则补齐）

### 6. 主站：无改动（broken 已被 `/api/sites` 默认过滤）

---

## 🚫 禁止改动

- `src/components/**`、`navSources.js`、`index.css`、`tailwind.config.js`、`vite.config.js`、`package.json`
- verify.mjs 45 条语义全保留（不新增断言）
- 现有功能全部保留

## ⚠️ 坑点预警

1. **Cron 入口与 HTTP 入口分离**：onScheduled 无 Authorization，必须走内部直调；HTTP /api/check/run 必须 authGuard
2. **检测时长预算**：Workers 免费 duration 30s；实测单轮耗时，超时则分批（batch 参数）
3. **并发 ≤4**：同 IP 对目标站友好；勿并发风暴
4. **429/403**：429 不计失败（限流信号）；403 计失败但连续 2 次才标 broken（反爬 UA 误伤防护）
5. **HEAD fallback**：HEAD 405 → GET `Range: bytes=0-0`
6. **日志清理**：只留 30 天，防表无限膨胀
7. **check_logs 级联**：site_id FK ON DELETE CASCADE（M1 建表已有）
8. **重复触发防护**：检测中再触发 → 429
9. **Pages scheduled handler 写法**：以 Cloudflare 官方文档为准（wrangler.toml `[[triggers]]` 或 `crons` 字段二选一，实测确认）
10. **migration 003 本地+远程都执行**（幂等 IF NOT EXISTS）
11. **secrets 值**：见启动提示词；执行 `wrangler pages secret put` 时按提示输入；**禁止写入任务卡/提交文件**
12. PowerShell 写中文文件损坏 UTF-8 → 源码/SQL 用编辑器工具改

## ✅ 验收与汇报

### 验证命令
```
npm run lint · npm run build · npm run verify   # verify 45/45 全绿（不新增）
npx wrangler d1 execute food-nav-db --local --file schema/migrations/003-check.sql   # 幂等
npx wrangler pages dev dist --port 8788         # 本地 API
```

### 手动验证清单（逐项 ✓/✗）
1. 检测核心：造 3 类测试站点（200 正常 / 404 失效 / 超时不可达）→ runChecks 后 status 分别 active / broken(2 次后) / checking→broken
2. 单次检测 429/403 不误杀：429 不计失败、403 连续 2 次才 broken
3. 手动触发：admin 检测中心点「开始检测」→ 汇总返回（checked/active/broken）→ 日志表出现新记录（含耗时/状态码）
4. 单站检测：站点表格触发单站 → 该站日志更新
5. 主站无感知：broken 站点被 `/api/sites` 过滤（主站不显示）；active 恢复后重新出现
6. 日志分页：limit/offset 正确；30 天清理规则生效（造旧数据验证可选）
7. 重复触发：检测中再触发 → 429 提示
8. Cron：本地用 cron 触发方式验证 onScheduled 跑通全量检测；线上 cron 配置确认存在
9. 鉴权：无 token 调 /api/check/run → 401
10. verify 45/45 · lint 0/0 · build ✓；M2 部署后线上 admin 可用
11. 移动端 375：检测中心页无溢出

### 汇报格式
1. 改动清单（新增/修改文件）
2. 验证结果（命令输出 + 清单 11 项逐条 + **检测耗时实测数据**）
3. **2 张截图**：admin 检测中心（含日志表）/ 主站 broken 站点隐藏效果
4. 部署状态：M2 部署完成情况 + M3 是否部署（含 cron 配置确认方式）
5. 遗留问题与风险
