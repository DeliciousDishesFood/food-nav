# task-11 · M4 访问统计 + 检测误判修复 + 热度打标 T1

> 生成：2026-10-05 · 副参谋（已评审定稿）
> 前置必读：`dev-docs/STATUS.md`、`dev-docs/architecture/02-backend-design.md`（§四 检测机制 + 热度/防刷）、`03-m1-backend-detail.md`、task-10（checker 现状）
> 前置状态：M1+M2+M3 完成并部署；verify 45/45

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\dev-docs\STATUS.md`、`E:\react\food-nav\dev-docs\architecture\02-backend-design.md`、`03-m1-backend-detail.md`、本任务文档、`E:\react\food-nav\functions\api\_lib\checker.js`、`_lib\db.js`、`_lib\response.js`、`_lib\auth.js`、`_lib\validate.js`、`functions\api\sites.js`、`functions\api\check\run.js`、`src\App.jsx`、`src\admin\AdminShell.jsx`、`src\admin\AdminDashboard.jsx`、`src\admin\AdminApi.js`、`src\admin\AdminSiteForm.jsx`、`schema\migrations\003-check.sql`、`tests\verify.mjs`。

任务：**M4 三合一**——① 每日 UV 访问统计（middleware + daily_visits 表 + admin 访问统计页含 SVG 折线图，**前端零改动**）② 链接检测误判修复（UA 升级 + 失败分级：确定性 2 次判死 / 可疑 3 次判死 + 已误判站点恢复）③ 热度统计与打标（点击/收藏上报 + 防刷基础版 + admin 打标「热门/新品/推荐」+ heat 排序联动）。

硬约束：主站 `src/components/**` 零改动（**埋点走 App.jsx 全局事件委托 + MutationObserver，不进任何组件**）；`navSources.js`/`index.css`/`tailwind.config.js`/`vite.config.js` 不动；verify 45 条语义全保留 + **新增 2 条（点击上报 / 收藏上报）→ 47**；运行时依赖不新增（图表手写 SVG，禁引 ECharts/图表库）。

完成后按本文「✅ 验收与汇报」逐项验证并汇报（含 3 张截图）。

---

## ⚠️ 首步环境检查

1. `npx wrangler whoami` 登录态
2. 本地/远程 D1：`npx wrangler d1 execute food-nav-db --local --file schema/migrations/004-visits.sql`（远程同命令不带 --local）
3. 本地 API：`npx wrangler pages dev dist --port 8788`

---

## 📋 任务清单

### 1. schema/migrations/004-visits.sql

```sql
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
  bucket TEXT NOT NULL,              -- 'click'|'favorite'|'visit' + YYYY-MM-DD-HH24
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, bucket)
);
```

### 2. 每日 UV 统计（前端零改动）

**functions/_middleware.js**（新增，Pages 根中间件）：
- **只统计页面请求**：`normalizePath(pathname) ∈ {'/', '/admin'}` 且 `Accept` 含 `text/html`；**排除**一切 `/api/`、`/assets/`、`/covers/`、静态文件（.js/.css/.png/.svg/.ico/robots.txt 等）——否则 UV 虚高
- 读 cookie `fv_id`；无 → `crypto.randomUUID()` + `Set-Cookie: fv_id=<uuid>; Max-Age=31536000; Path=/; SameSite=Lax`（HttpOnly 不需要，前端不读）
- 入库：`INSERT OR IGNORE INTO daily_visits (visit_date, visitor_id) VALUES (date('now'), ?)`（幂等，同 visitor 当日重复访问零成本）
- **限频**：同 IP 每分钟统计写入 >30 次 → 跳过（track_limits 表 bucket='visit'+YYYY-MM-DD-HH24，count++，超限跳过不阻断页面）
- 必须 `await next(request)` 返回原页面响应；middleware 出错也要放行（try/catch 兜底，不因统计影响页面）

**GET /api/stats/visits?days=30**（新增，authGuard）：`GROUP BY visit_date` → `{ok,data:{list:[{date, uv}]}}`（按日期升序，无数据日期不补 0——前端图表自行对齐）

### 3. 检测误判修复（M4b）

**functions/api/_lib/checker.js**：
- **UA 升级**：`CHECK_UA` 改为真实浏览器 UA（如 `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36`）——反爬站点对 Workers 默认 UA 更易拒
- **失败分级**（gradeResult 重构）：
  - 确定性失败：404 / 410 / 451 / 网络错误 / 超时（statusCode=0）→ `failMode:'increment'`，**2 次判死**（保持现 BREAK_AFTER_FAILS）
  - 可疑失败：403 / 406 / 418 / 999 / **520-527（Cloudflare 边缘码）** / 502 / 503 → `failMode:'suspicious'`：status 置 `checking`、fail_count +1，**连续 3 次才 broken**（新增常量 `SUSPICIOUS_BREAK_AFTER=3`）；恢复 200 → active 清零
  - 429 不计失败（保持）
- `resolveStatus` / `applyFailMode` 支持 `suspicious` 档（applyFailMode 同 increment 逻辑，判死阈值按档位取）
- **已知误判站点恢复**：douguo.com（豆果，403）、tinrry.com（Tinrry，526）——本任务内**实测**：单站检测跑这两个站，若 GET 200 → 自动 active（broken 单站检测救回机制已有）；若仍 403/526 → 按可疑档落 checking 而非 broken；**汇报实测结果**（HEAD/GET 各自状态码）。修复逻辑生效后对这两站跑单站检测验证不再 broken

### 4. 热度统计与打标（M4c）

**上报接口**（新增，均 POST，同源校验 + 限频）：
- `functions/api/track/click.js`：body `{url}` → 按 url 精确匹配 sites（找不到忽略不报错）→ `click_count+1`、`heat_score = favorite_count*5 + click_count` 重算；限频 `track_limits`（ip, 'click'+HH24，每分钟 ≤30）
- `functions/api/track/favorite.js`：body `{name}` → 按 name 匹配 sites → `favorite_count+1`、heat 重算；限频同上（'favorite'+HH24，每分钟 ≤30）
- **同源校验**：`Sec-Fetch-Site` 头非 `same-origin` / `none` → 403（防跨站盗刷）；无该头时用 Origin 白名单兜底
- 响应：`{ok:true}`（成功与否都不影响页面行为）

**前端埋点（src/App.jsx 新增 useEffect，components/** 零改动）**：
- 点击上报：`document.addEventListener('click', handler, true)`（捕获阶段）→ `e.target.closest('a[href^="http"]')` 且 href 非同源 → `fetch('/api/track/click', {method:'POST', body:{url}, keepalive:true})`（keepalive 保证跳转前送达）；**防抖**：同 URL 300ms 内只报一次
- 收藏上报：`MutationObserver` 观察 `document.body` 的 `button[aria-pressed]` 属性变化 → 从 `aria-label` 提取站点名（`收藏 XXX` / `取消收藏 XXX` → 去掉前缀）→ `fetch('/api/track/favorite', {name, keepalive:true})`（**切换为 true 才报收藏+1**？——简化：只要 aria-pressed 值变化即上报一次 favorite 事件，服务端按 toggle 语义处理：本任务按「收藏时 +1、取消不变」：解析 aria-label 前缀是「收藏」（=现在没收藏→点了变成收藏）才上报）
- 错误静默（console.warn 可留，不弹 UI）；不影响页面任何行为

**admin 打标**：
- `AdminSiteForm.jsx`：tag 字段加**快捷下拉**（热门 / 新品 / 推荐 / 无）+ 保留自定义输入；保存逻辑不变（tag 字段已存在）
- `AdminSites.jsx`：站点表格行内加 tag 徽标展示（若有）
- 主站零改动：NavCard 已渲染 tag 角标，管理员打标后主站卡片自动显示

**排序联动**：`GET /api/sites?sort=heat` 已实现（M1），验证 heat_score 更新后排序正确

### 5. admin 访问统计页 + 图表

- `src/admin/StatsChart.jsx`（新增，**手写 SVG**，禁图表库）：折线图（近 30 天 UV）+ 数据点/峰值标注；贴纸风（token 色：`text-food-primary`/`#FFB6CD` 系、圆角、简洁网格线）；`viewBox` 响应式（宽度 100%）
- `src/admin/AdminStats.jsx`（新增）：今日 UV / 昨日 UV / 近 30 天峰值卡片 + 30 天折线图；数据来自 `/api/stats/visits?days=30`
- `AdminShell.jsx` Tab 增加「访问统计」；`AdminApi.js` 增加 `fetchVisits(days)`
- `AdminDashboard.jsx`：加「今日访问」卡片（复用同一接口 days=1）

### 6. verify.mjs 演进（45 → 47）

- mock 扩展：`/api/track/click`、`/api/track/favorite` → `{ok:true}`（apiMode ok）
- 新增 2 条：① 点击卡片链接（dispatch click）→ 断言 fetch 含 `/api/track/click` ② 切换收藏按钮（模拟 aria-pressed 变化触发 observer）→ 断言 fetch 含 `/api/track/favorite`
- 原 45 条语义全保留

---

## 🚫 禁止改动

- `src/components/**`（埋点只允许 App.jsx 全局委托/MutationObserver，**不允许改 NavCard/LazyCard 等任何组件**）
- `src/data/navSources.js`、`index.css`、`tailwind.config.js`、`vite.config.js`、`package.json`
- verify.mjs 原 45 条断言语义
- 现有功能全部保留（含 M3 检测机制其余行为）

## ⚠️ 坑点预警

1. **middleware 只统计页面路径白名单**（`/` `/admin` + Accept text/html）；静态资源/API 请求严禁计入 UV（否则数字虚高无意义）
2. **middleware 出错必须放行页面**（try/catch + await next），统计不能成为访问故障点
3. **可疑失败档位**：403/520-527 等首次只标 `checking`，3 次才 broken；不要把豆果/Tinrry 这类可访问站标死
4. **UA 升级**要完整（Chrome 桌面版），Workers fetch 默认 UA 是反爬高发目标
5. **点击/收藏上报**：keepalive:true + 防抖；**上报失败/被限频都不影响主站交互**（fetch catch 静默）
6. **收藏上报语义**：只有「从没收藏 → 点了收藏」（aria-label 以「收藏」开头）才 +1；取消不 +1
7. **同源校验**：Sec-Fetch-Site 非 same-origin → 403（防跨站盗刷）；verify 的 jsdom fetch mock 需带对应头或跳过该校验（mock 内可控）
8. **track_limits 限频**：IP×bucket 计数，超限静默跳过（不报错不封禁）
9. **migration 004 本地+远程都执行**（幂等）；Pages Functions 新增文件无需额外配置
10. **图表禁依赖**：手写 SVG，禁 ECharts/Recharts/CDN
11. verify 断言注意：click 委托用捕获阶段（capture=true）；MutationObserver 在 jsdom 需 await 微任务后才触发
12. PowerShell 写中文文件损坏 UTF-8 → 源码/SQL 只用编辑器工具改

## ✅ 验收与汇报

### 验证命令
```
npm run lint · npm run build · npm run verify   # verify 47/47，原 45 全绿
npx wrangler d1 execute food-nav-db --local --file schema/migrations/004-visits.sql  # 幂等
npx wrangler pages dev dist --port 8788         # 本地 API
```

### 手动验证清单（逐项 ✓/✗）
1. **UV 去重**：同一浏览器访问 / 两次（同 cookie）→ 今日 UV = 1；清 cookie 再访 → 2；刷新不再增加
2. **静态资源不计入**：刷新页面资源请求不产生新 UV 行（看 daily_visits 行数）
3. **admin 访问统计**：今日/昨日/30 天折线图渲染；图表数据与 daily_visits 一致；375px 不溢出
4. **误判修复**：douguo.com 与 tinrry.com 单站检测 → **不再 broken**（GET 200 → active；仍 403/526 → checking）；汇报两站 HEAD/GET 实测状态码
5. **点击上报**：主站点卡片 → click_count +1、heat_score 更新；跨站伪造请求（非 same-origin）→ 403
6. **收藏上报**：点收藏 → favorite_count +1、heat 更新；取消收藏不 +1
7. **打标**：admin 给站点设「热门」→ 主站卡片角标显示「热门」（零组件改动验证）
8. **heat 排序**：`?sort=heat` 按 heat_score 降序
9. **限频**：同 IP 高频点击/收藏 → 静默跳过不报错（可选实测）
10. verify 47/47 · lint 0/0 · build ✓；M3 检测回归正常
11. 移动端 375：admin 访问统计页无溢出

### 汇报格式
1. 改动清单（新增/修改文件 + verify diff）
2. 验证结果（命令输出 + 清单 11 项逐条 + **douguo/tinrry 实测状态码**）
3. **3 张截图**：admin 访问统计折线图 / 误判修复后两站检测结果（checking 或 active）/ 主站打标角标
4. 部署状态：本地验证 + 是否部署（migration 004 远程 + build deploy）；未部署给出命令
5. 遗留问题与风险
