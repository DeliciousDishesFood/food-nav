# STATUS · 项目状态交接（OpenCode 下次启动必读）

> 更新：2026-10-10 · 副参谋（task-23 · 今日签 + AI 工作台极简 全绿，**纯前端、默认未部署**；线上版本不变 = M10 + M9-T3 + M9-T4）
> 上一版：2026-10-09 task-22（M9 全关）
> 本文件是 OpenCode 恢复上下文的第一入口。**任何新任务启动前先读本文件 + 对应任务文档**，不要在不知道项目状态的情况下动手。

---

## 一句话现状

**线上版本 = M10 + M9-T3 + M9-T4**（2026-10-09 task-22，deployment `625437fb`）。**task-23（2026-10-10）已完成并全绿**：首页新增「今日签」贴纸卡（日期种子固定 + 摇签换签 + 站点直达）+ AI 樱见工作台极简化（删双静态面板、单列居中、最近会话收进 header History 图标浮层）→ lint 0/0 · verify **54/54**（52+2，零删除）· build ✓ · 本地 CDP 手动清单 **27/27** · 截图 4 张（`dev-docs/reports/task-23/`）。**待部署批次 = task-23（纯前端，由指挥官决定是否上线）**。

## 当前里程碑状态

| 里程碑 | 状态 |
|---|---|
| M0 文档化（README/架构文档/GitHub 存档） | ✅ 完成 |
| **M1 后端骨架**（D1 + 只读 API + 前端降级） | ✅ 完成（lint 0/0 · verify 42/42 · 线上已部署，自定义域生效） |
| **M2 管理面板**（登录 + CRUD + 图标/封面选择） | ✅ 完成（verify 45/45 · **已部署**，secrets 已配置） |
| **M3 链接检测**（checker + 手动触发 + cron Worker） | ✅ 完成（verify 45/45 · **已部署**，cron 每天 UTC 04:00） |
| **M4 访问统计 + 检测优化 + 热度打标** | ✅ 完成（verify 47/47 · **已部署**，2026-10-05 task-12 第 0 步完成 migration 004 + Pages + cron 重部署 + middleware 回归） |
| **M5 AI 智能问答**（/ask + GLM 代理 + tool calling + 流式 + 推荐卡片） | ✅ 完成（verify 49/49 · **已部署**，GLM_API_KEY 已 secret put；实测模型 **glm-4-flash**） |
| **M6 AI 页体验打磨 + 主站抖动修复**（新视觉/CustomScrollbar/光标/nav-cache/overflow） | ✅ 完成（verify 50/50 · **已部署** 2026-10-07 task-17） |
| **M7 AI 问答页布局打磨**（header 悬浮胶囊/双栏与滚动条净距/暗色 token/375 适配） | ✅ 完成（verify 50/50 · **已部署** 2026-10-07 task-17，见 task-14） |
| **M8 AI 页工作台重构 + 品牌「樱见」**（空态工作台 grid/header 真居中图标/SVG 品牌/记忆会话/滚动条 6px+18px 净距+小屏隐藏） | ✅ 完成（verify 50/50 · 验收脚本 100/100 · **已部署** 2026-10-07 task-17，见 task-15/15.1） |
| **M9-T1 收藏服务端化 + 热度闭环 + 轻签名 + 热度看板**（favorites 表/签名与限频/前端同步层/AdminHeatBoard） | ✅ 完成（verify 52/52 · CDP 验收 49/49 · **已部署** 2026-10-07 task-17（D1 005 + FAVORITE_SALT secret + deploy），见 task-16/17；剩余子项已由 task-22 M9-T4 闭环） |
| **M9-T2 链接检测分级修正 + 死链复活机制**（有响应=可达 / 404·410·451·网络层·CF 边缘码判死 / broken 纳入 cron 与全量候选） | ✅ 完成（分级单测 49/49 · 本地 12/12 · 线上验收 13/13 · 主站回归 23/23 · **已部署** 2026-10-07 task-18（cron `91019a4a` + Pages `851631c9`），见 task-18） |
| **M10 T1 AI 推荐闭环 + 工作台交互修复 + 页面反馈感**（推荐卡主体=追问 / 角落 ExternalLink 打开 · 返回工作台 · askHistory 多会话+单条删除 · 路由 180ms 淡入 · 全局点击散樱） | ✅ 完成（本地 CDP 55/55 · **已部署** 2026-10-07 task-20（Pages `42835c8a`）+ 线上回归 **92/92** + 探针 4/4），见 task-19/20 |
| **M9-T3 检测豁免机制 + 死链治理**（`sites.skip_check` / pickTargets 三路径排除 / 单站 `{skipped}` 语义 / admin 开关+豁免徽标 / 删 id 9·10 + 插 id 29·30 / tinrry 豁免恢复） | ✅ 完成（单测 36/36 · 本地 16/16 · 线上 API 25/25 · CDP 26/26 · **已部署** 2026-10-08 task-21：migration 006 + cron `b80cb8d5` + Pages `c1bed251`），见 task-21 |
| **M9-T4 收尾工程打包**（封面破图兜底 / 严格 404 catch-all / CHECK_TIMEOUT_MS 8s / D1 原子锁） | ✅ 完成（lint 0/0 · verify 52/52 · 本地锁并发 429 · 本地/线上全量 remaining=0 · CDP 截图 3+1 · **已部署** 2026-10-09 task-22：migration 007 + cron `79b39a46` + Pages `625437fb`），见 task-22。**M9 全部关闭** |
| **task-23 今日签 + AI 工作台极简**（DailyFortune 日期种子签卡 + AskWorkspace 砍双面板单列居中 + AskHistoryMenu header 浮层恢复/单删） | ✅ 完成（lint 0/0 · verify **54/54** · 本地 CDP 27/27 · 截图 4 张 · **纯前端未部署** 2026-10-10），见 task-23 |

## 验证结果（2026-10-10 task-23 · 今日签 + AI 工作台极简 · 已完成，默认不部署）

- **改动（红线全绿）**：**新增** `src/components/DailyFortune/{DailyFortune.jsx,fortune.css}`（日期种子签卡：本地 `YYYY-MM-DD` hash 抽分类→站点（跳过 0 站分类）、同日签文稳定、点击摇签 0.6s 动画 + Math.random 换签（650ms 后自动摘 shake class）、站点名 `<a _blank noopener stopPropagation>`、4 模板池、groups 空 render null、全 token 暗色自适配、reduced-motion 关动画）· **新增** `src/ask/AskHistoryMenu.jsx`（`aria-label="历史对话"` lucide History 图标 + z-50 玻璃浮层：时间 + 20 字预览 + 当前徽标 + Trash2 单删 + 空态 + 外点关闭 + storage 同步；打开时在事件里读 `readSessions()` 规避 oxlint set-state-in-effect）· **改** `src/pages/HomePage.jsx`（仅挂 `<DailyFortune groups={groups}/>`，在 Header 之后、`<main>` 之外）· **改** `src/ask/AskWorkspace.jsx`（删「今日美味」「最近会话」双面板 → 单列居中：插画+樱见+问候+children 注入输入框+chips 换一批，保留 `SakuraLogo` 导出）· **改** `src/ask/AskPage.jsx`（header 右格加 History 浮层（chat 态也渲染）· composer 空态注入工作台列 / 对话态留页底 · 删未用 handlePick · **header 加 `relative z-50`** 修浮层被聊天气泡盖住的层叠问题（header 胶囊 backdrop-blur 截断了浮层 z-50）；SSE/节流/Abort/停止/?q=/返回工作台逐行未动）· **改** `tests/verify.mjs`（+2 断言 52→54 零删除：`.daily-fortune` 存在 + `header [aria-label=历史对话]` 存在）
- **红线**：`NavCard/**`、`Layout/**`、`MusicPlayer/**`、`TypeWriterQuote.tsx`、主站 `Header.jsx` 零改动（git status 可证）；零新依赖；`tailwind.config.js`/`index.css` token 只复用；无后端/数据库改动
- **命令基线**：lint **0/0** · verify **54/54** · build ✓（存 `dev-docs/reports/task-23/{lint,verify,build}.txt`）
- **本地 CDP 手动验收 `t23-accept.mjs` → 27/27**（`accept-log.txt`）：10 项清单全覆盖 —— 签卡位置/贴纸风 · 同日刷新签文一致 + 摇签动画换签 + class 自动清除 · 站点链接新开不摇签 · 暗色 token · 375 无溢出 · /ask 无双面板单列居中 · History 浮层列 2 条 + 恢复 + 外关 + Trash 2→1→空态 · 对话态图标在 · `?q=` 预填 + 发送/■停止/流式回复（真实 glm-4-flash）/返回工作台立即落盘/清空对话 · 主站收藏 toggle/主题/搜索/音乐无回归 · 全程无未捕获页面异常
- **截图 4 张**（`dev-docs/reports/task-23/`）：`01-home-fortune-light` · `02-ask-workspace-minimal` · `03-history-dropdown` · `04-home-fortune-dark`（附加）
- **过程坑（详见 report §5）**：① 浮层被气泡盖住 → header `relative z-50`（`elementFromPoint` 实测）；② CDP 同 URL navigate 是同文档导航不重载 → 脚本改 `Page.reload`；③ 首版 shake class 常驻 + dist 未重建 → 改独立 shaking state + 重建；④ 服务端收藏合并后首卡可能已收藏 → 断言改「翻转 ±1」
- **部署**：**默认不部署**（任务卡口径）。上线命令 `npm run build && npx wrangler pages deploy dist --project-name food-nav`（纯前端；回滚回 `625437fb`）
- **汇报全文**：`dev-docs/reports/task-23/report.md`

## 验证结果（2026-10-09 task-22 · M9 收尾工程打包 T1 · 已部署）

- **改动（红线全绿）**：`src/components/NavCard/NavCard.jsx`（**唯一允许的主站组件改动**，+4/-1：useState + coverFailed + img onError → CoverPlaceholder，布局/动画 class 逐字保留）· `functions/api/[[path]].js`（新建 catch-all 404 信封）· `functions/api/_lib/checker.js`（`CHECK_TIMEOUT_MS=8000` + `tryAcquireCheckLock(db)/releaseCheckLock(db)` D1 原子锁：ON CONFLICT DO UPDATE WHERE until<? + RETURNING 判行数，异常放行兜底，删 globalThis 内存锁）· `functions/api/check/run.js`（传 db）· `cron/src/index.js`（**补锁**：拿锁失败跳过 cron + finally 释放）· `schema/migrations/007-check-lock.sql`（新建幂等）；**`src/pages/**`、`index.css`、`tailwind.config.js`、`vite.config.js`、`navSources.js`、`tests/verify.mjs` 零改动**，零新依赖
- **verify 52 语义保持**：grep verify.mjs 无卡片 img/cover 断言 → 52/52 直接通过（未改 verify.mjs）
- **部署三步**：① `wrangler d1 execute food-nav-db --remote --file schema/migrations/007-check-lock.sql` → exit 0 `rows_written:3`；重跑 `rows_written:0`（幂等）；② `wrangler deploy --config cron/wrangler.toml` → **version `79b39a46-b8ee-45ad-bed6-dcc8104be605`**（`0 4 * * *`）；③ `npm run build && npx wrangler pages deploy dist --project-name food-nav` → **deployment `625437fb.food-nav-5eb.pages.dev`**
- **线上终态**：`active=27` `skip=[8]` · catch-all：`/api/abc` `/api/categories/1` `/api/_lib/db` → 404 信封；`/api/health` 200 db:up；`/` 200；`/assets/*.js` `/covers/*.svg` 200（静态不误伤）· 线上全量检测 4 轮 **remaining=0**（broken 0 / errors 0）· 锁释放后单站补跑 200
- **本地验收**：D1 锁并发两次 /api/check/run → 第二个 **429 check_in_progress**、第一个 200；释放后可再跑、锁表无残留 · 全量 remaining=0 · 封面兜底 CDP 断言 placeholder ✓（01/01a 对比截图）· `/api/abc` 404 信封截图（02）· 375 兜底态无溢出（03）
- **命令基线**：lint **0/0** · verify **52/52** · build ✓（`index-C-xHdVPZ.js` 309.71 kB）
- **截图 4 张**（`dev-docs/reports/task-22/`）：`01-cover-fallback-broken` · `01a-cover-normal` · `02-api-404-envelope` · `03-mobile-375-cover-fallback`
- **遗留**：D1 锁 TTL 60s——当前单轮 timeBudget 18s + 最坏 16s < 60s 安全；本地 pages dev 与 cron 是两个独立 miniflare D1（本地 cron 测试需在 cron/.wrangler 单独迁移 007）
- **汇报全文**：`dev-docs/reports/task-22/report.md`

## 验证结果（2026-10-08 task-21 · M9-T3 检测豁免机制与死链治理 · 已部署）

- **改动（红线全绿）**：`schema/migrations/006-skip-check.sql`（新建）· `functions/api/_lib/checker.js`（`pickTargets` 三路径 `AND skip_check = 0` + 新导出 `skippedSiteIds` + 文件头豁免说明）· `functions/api/check/run.js`（单站全命中 → `{skipped:true, skippedIds:[…], total:0}`，否则 `summary.skippedIds`）· `functions/api/_lib/db.js`（SITE_COLUMNS/toSiteDto/createSite/SITE_FIELD_COLUMNS 加 `skipCheck`）· `functions/api/_lib/validate.js`（skipCheck 归一 0/1）· `src/admin/AdminSiteForm.jsx`（「跳过自动检测」checkbox + 说明文案 + 回显 + payload）· `src/admin/AdminSites.jsx`（「豁免」徽标 + 跳过提示）；**`src/components/**`、`src/pages/**`、`index.css`、`tailwind.config.js`、`vite.config.js`、`navSources.js`、`tests/verify.mjs` 零改动**，零新依赖，新站 tag 空未打标
- **id 顺延**：任务卡原写 28/29，线上 `MAX(id)=28`（M10 的 benlai.com 重复站，不可删）→ 按「冲突则顺延」改 **29 美食天下 / 30 好豆网**
- **migration 006 幂等口径**：**schema 段一次性**（重跑首句 `ALTER TABLE … ADD COLUMN` 报 `duplicate column name: skip_check` exit 1、数据零变更）+ **数据段幂等**（远程重跑 `IDENTICAL=true ROWS=27`）；执行日志 `migration-006-remote{,-rerun,-rerun-full}.txt`
- **部署三步**：① `wrangler d1 execute food-nav-db --remote --file schema/migrations/006-skip-check.sql` → exit 0 `rows_written:35`；② `wrangler deploy --config cron/wrangler.toml` → **version `b80cb8d5-76b9-4c3a-ba57-57ba52215557`**（`0 4 * * *`）；③ `npm run build && npx wrangler pages deploy dist --project-name food-nav` → **deployment `c1bed251.food-nav-5eb.pages.dev`**
- **线上终态**：`total=27 {"active":27}` · `skip=[8]`（tinrry `active / failCount=0 / skipCheck=true`）· `dead910=0` · 29/30 `active` 且 `tag=''`；单站 id 8 → `{skipped:true}`，全量首轮 `total=26` 且 id 8 从不入候选
- **命令基线**：lint **0/0**（曾因验收脚本未用变量出 1 warning，已修）· verify **52/52**（未改 verify.mjs，admin 场景不断言表单 payload、23 卡片来自 mock → 语义保持）· build ✓（`index-B04rCPou.js` 309.67 kB）
- **验收脚本**：`t21-skip.mjs` **36/36**（pickTargets 三路径/DTO/校验/migration 静态断言/admin 前端/新站真实检测 403→active、200→active）· `t21-local.mjs` **16/16**（pages dev 8788：单站跳过、全量候选排除豁免站、PUT 开关往返、默认只回 active）· `t21-online.mjs` **25/25**（探针 4 + 27 站快照 + 单站 skipped + 全量 26 + 稳定化补检）· `t21-live.mjs` **26/26**（CDP：主站 27 卡片逐帧懒加载渲染、375 无溢出、admin 表单回显勾选、新增默认关、豁免徽标、单站跳过提示、暗色徽标、亮色还原）
- **截图 6 张**（`dev-docs/reports/task-21/`）：`01-admin-skip-check`（表单开关已勾选）· `01a-admin-skip-badge`（tinrry 豁免徽标）· `02-home-27-sites` + `02-home-27-sites-full`（整页 27 卡片）· `03-mobile-375` · `04-admin-dark-badge`；01/01a/02/03/04 均过像素探针
- **遗留**：① `CHECK_TIMEOUT_MS=5000` 边缘偶发超时误判（本次星巴克 id16 连续 5 次超时判 broken、蜜雪 id19 一次超时 → 补检均恢复 active）——M9 剩余子项候选，**本任务未改（超范围）**；② meishichina 403 反爬 → 新分级判 active，若边缘 IP 被彻底阻断会走网络层判死，届时由管理员决定是否豁免；③ 迁移需沿用「schema 一次性 + 数据幂等」写法；④ CDP 首轮 2 FAIL 为脚本时序抖动（轮询窗口过短 + 暗色导航后未重回站点管理页），修复重跑全绿
- **汇报全文**：`dev-docs/reports/task-21/report.md`（改动清单 / 8 项手动清单逐条 / 截图表 / 部署状态 / 遗留风险）

## 验证结果（2026-10-07 task-20 · M10 部署上线 + 线上回归）

- **部署前本地基线**：lint 0/0 · verify **52/52** · build ✓（输出存 `dev-docs/reports/task-20/{lint,verify,build}.txt`）；`wrangler whoami` 已登录（account `67a7b579...`）
- **部署（纯前端，cron/D1/secrets 零改动）**：`npm run build && npx wrangler pages deploy dist --project-name food-nav` → **deployment `42835c8a-417c-4b53-ab5c-c6db02d6d028`**（Production/main，19 个文件、14 复用 + 5 新传，3.89s）；上一版 `851631c9`（M9-T2）留作回滚
- **探针 4/4**（`probes.txt`）：`/` **200** · `/api/health` **200** `{"ok":true,"data":{"db":"up"}}` · `/ask` **200**（SPA 回退）· `/api/sites?status=active` **200**；附带确认线上 HTML 引用新 bundle `index-BvkBz1d2.js`（与本地 build 产物哈希一致）
- **CDP 线上回归 `t20-live.mjs` → 92 passed / 0 failed**（exit 0，`acceptance-log.txt`）：
  - [0] 探针 4 · [1] 主站回归（24 卡片=API、无降级条、nav-cache 新鲜、搜索过滤+清空恢复、音乐播放器展开/收起）· [2] 收藏 PUT→200→heat+5→刷新保留→DELETE→列表空→**热度还原基线** · [3] M10-① 推荐卡（主体 `<button>` 追问、追问问句+1、AI 流式完成、角落钮 target=_blank+noopener+≥40×40+aria）· [4] M10-② 返回工作台（历史保留、入面板、继续对话恢复含追问）· [5] M10-③ 单条删除（2→1 同步 storage、删空→空态+键移除）· [6] M10-④ route-fade 0.18s+pointer-events:auto+reduced-motion none · [7] M10-⑤ 樱花（3-5 片/层 pointer-events:none/300ms 限频/1s 清 DOM/reduced-motion 0 片/入口点击不被拦截）· [8] 暗色（主站切换+ask-panel+删除钮 token）· [9] 375（主站//ask 无溢出、header 组在视口、返回工作台≥36、删除钮≥40×40）· [10] admin 只读冒烟（登录、热度榜 Top10、站点表 27 行，未点任何写按钮）· [11] 还原（主题亮色、服务端收藏空、热度=基线、ask-history/admin-token/favorites 已清）
- **首轮跑出 11 FAIL 的根因（脚本自身两处 bug，非产品问题，已修复重跑）**：① 模板字符串里正则 `\s` 被 JS 转义成 `s`（HEARTS/FV_EXPR 选择器永不匹配 → 收藏段全挂，且**未产生任何线上写入**）② 01 截图像素探针取 `.ask-bubble-me` 的 `backgroundColor`（渐变背景恒透明）→ 改用渐变起点色 `[255,143,177]` 定值探针；另 admin 站点表等待条件从「≥1 行」（会命中「加载中」行）改为「≥10 行 + 共 N 个站点文案」
- **证据**：`dev-docs/reports/task-20/`（t20-live.mjs · acceptance-log.txt · netlog-live.txt · probes.txt · run-output.txt · 01-ask-recommend-ask / 02-ask-back-workspace / 03-mobile-375 / 04-sakura-burst / 05-dark / 06-home-regression 共 6 张截图；01/02/03/06 过像素探针，04/05 已人工抽查）
- **lint 0/0 于部署后复核**（新脚本入 dev-docs 不破坏）；verify/build 未再跑（部署后源码零改动）

## 验证结果（2026-10-07 task-19 · M10 AI 推荐闭环 + 工作台修复，本地验收，默认不部署）

- **改动（新增 6 / 修改 6）**：
  - 修改 `src/ask/AskCard.jsx`：根改 `relative` 容器 = 主体 `<button aria-label="关于${name}继续追问">`（追问主交互，footer「继续追问 →」）+ 兄弟节点角落 `<a target="_blank" rel="noopener noreferrer" aria-label="打开${name}站点" title="打开站点" class="absolute right-2 top-2 z-10 h-10 w-10">`（手绘 ExternalLinkIcon，无 onAsk 时 `window.open` 兜底）；**不再整卡外链**
  - 修改 `src/ask/AskChat.jsx`：新增 `onAskSite` prop → Bubble → `<AskCard site onAsk={onAskSite} />`
  - 修改 `src/ask/AskPage.jsx`：`view` 状态机（workspace|chat）+ `activeSessionId` state（渲染）与 `sessionIdRef`（写入）分离；`backToWorkspace()`（flush 落盘 → 分离新会话，保留历史）+ header 左侧组「回到主站图标钮 | 返回工作台 pill」（`h-9`，`disabled={streaming}`）；`handleAskSite` 模板消息走既有 `send()`（SSE/节流/停止逐行未动）；`clear()` = 只删当前会话（`removeSession`），不再清全部；条件渲染 `view==='chat' && messages.length>0`
  - 修改 `src/ask/AskWorkspace.jsx`：「最近会话」改多条列表 `RecentSession`（摘要行「继续对话 →」+ `Trash2Icon` 删除钮 `h-10 w-10 aria-label="删除会话"`，active 行 disabled+title 提示）+ 空态引导；新增 `activeSessionId/onRemoveSession` props
  - 修改 `src/ask/askHistory.js`：结构 `{savedAt, sessions:[{id,savedAt,messages}]}`，`persistSessions` 内部 `slice(0,10)` clamp；legacy `{savedAt,messages}` 读取时归一单会话；导出 `readSessions/writeAskHistory(messages, sessionId)/removeSession(id)/clearAskHistory/ASK_HISTORY_KEY/MAX_SESSIONS`
  - 修改 `src/App.jsx`：路由容器 `key={path}` + `.route-fade` 轻淡入；挂载 `<SakuraBurst />`（仅新增 import/包裹，SSE/收藏/主题逻辑零动）
  - **新增** `src/styles/route-fade.css`（0.18s 淡入，reduced-motion none）、`src/styles/sakura-burst.css`（layer z-999 pointer-events:none + 1s fly keyframes）、`src/components/effects/SakuraBurst.jsx`（document click 捕获、300ms 限频、3-5 片、1.1s 自清 DOM、reduced-motion 不触发、永不 preventDefault）
- **红线合规**：`index.css`/`tailwind.config.js`/`vite.config.js`/`navSources.js` 零改动；`src/components/**` 只新增 `effects/`（任务卡明示允许）；零新依赖
- **verify 52 语义保持说明**：grep `tests/verify.mjs` 无 AskCard/`target=_blank`/「去看看」断言；ask 段仅「home shows ask entry button」「/ask route renders composer + 发送冒烟」→ 推荐卡改按钮不冲突，**52/52 通过（未改 verify.mjs）**
- **验收（`dev-docs/reports/task-19/`）**：`t19-accept.mjs` CDP **55 passed / 0 failed**——卡片主体=`<button>` 非 `<a>`、角落钮 target=_blank+noopener+≥40×40+aria、追问问句同构用户气泡+AI 流式完成、返回工作台历史保留、恢复会话含追问、2 会话并存、删 1 条 2→1 同步 storage、删空→空态+键移除、注入 12→面板 10+flush 后 storage 10、写路径 clamp、route-fade=0.18s/reduced-motion none、花瓣 3-5 片/限频不叠加/1s 清 DOM/reduced-motion 0 片/不拦截点击、暗色、375 无横溢+删除钮≥40×40、主站回归
- **命令基线**：lint 0/0 · verify **52/52** · build ✓（输出存 `lint.txt`/`verify.txt`/`build.txt`）
- **证据**：`dev-docs/reports/task-19/`（acceptance-log.txt · t19-accept.mjs · 01-ask-recommend-ask / 02-ask-back-workspace / 03-ask-history-delete / 03a-ask-history-two-rows / 04-mobile-375 / 05-sakura-burst / 06-dark 共 7 张截图，均过像素探针）
- **部署**：默认不部署（任务卡口径）；如需上线 `npm run build && npx wrangler pages deploy dist --project-name food-nav`（纯前端 `src/**` 改动，cron/D1 不动）

## 验证结果（2026-10-07 task-18 · M9-T2 分级修正上线 + 线上全量验收）

- **改动**：`functions/api/_lib/checker.js`——`gradeResult` 重写（2xx/3xx、4xx(除 404/410/451)、普通 5xx 全部 `reset→active`；404/410/451 与 `statusCode=0` 走 `increment`，2 次判死；**520-527/530（Cloudflare 边缘码）归网络层失败**——用户拍板的方案 A，否则「边缘错误页」会被当可达复活）；删 `SUSPICIOUS_*` / `isSuspiciousCode`；新增导出 `nextSiteState(site,result)`（processSite 与单测共用同一套逻辑）与 `EDGE_DOWN_CODES`；`pickTargets` 的 since/默认路径改 `status IN ('active','checking','broken')` = **复活机制**；`resolveStatus` 对 `keep`（429）不再参与判死。`sites.js` 显示策略保持只回 active，未改
- **部署（顺序：cron 先、Pages 后）**：`npx wrangler deploy --config cron/wrangler.toml` → version `91019a4a-1878-4e34-acf4-6356a1c8f895`；`npm run build && npx wrangler pages deploy dist` → deployment `851631c9.food-nav-5eb.pages.dev`
- **验收（`dev-docs/reports/task-18/`）**：`t18-grade.mjs` **49/49**（403→active / 404 2 次判死 / 503→active / 526·530→checking→broken / 超时·DNS-TLS→判死 / 429 keep / pickTargets 候选含 broken / SUSPICIOUS 已清除）· `t18-local.mjs` **12/12**（pages dev + 8899 mock：403 复活、500 降级、HEAD-405 回退、真死链保持 broken、全量 39 站 4 轮收敛 remaining=0、broken 8/8 进候选、默认只回 active、check_logs 新 note）· `t18-online.mjs` **13/13**（2 pass 全量 + 稳定化补检 → **active 24 / broken 3 / checking 0**，任务前 5 个 broken 全部进候选重测 5/5，日志无「可疑档」旧文案）· `t18-live.mjs` **23/23**（首页 24 卡片=API 数、豆果/君之在列、3 真死链隐藏、无降级条、搜索/分类/收藏/主题/375 无溢出、admin 检测中心 note 断言）
- **命令基线**：lint 0/0 · verify **52/52** · build ✓ · 分级单测 49/49
- **证据**：`dev-docs/reports/task-18/`（grade-test-log.txt · local-checks.txt · online-checks.txt · live-checks.txt · check-logs.txt · sites-snapshot.json · 01-live-home-24cards / 02-live-mobile-375 / 03-admin-check-logs 三张截图均过像素探针）

## 验证结果（2026-10-07 task-17 · M6-M9 批次部署上线 + 线上回归）

- 部署四步全过：① `d1 execute --remote --file schema/migrations/005-favorites.sql` 执行 2 次（第 2 次 0 rows written，幂等）② `pages secret put FAVORITE_SALT`（管道 stdin 输入，明文未打印；`pages secret list` 显示 Value Encrypted）③ `npm run build`（17:09）+ `pages deploy dist` → deployment `5aeecaf8-5ee7-4866-8336-a2dfb762b765`（Production/main，17:10）④ cron Worker 未动
- 线上 6 项探针全过：`/api/health` db:up · `/` 200+`Set-Cookie: fv_id` · `/api/favorites` 401 no_visitor · `/api/stats/visits` 401 · `/api/ai/chat` 200 SSE（glm-4-flash）· `/api/sites?status=active` 200 信封
- CDP 线上回归 `dev-docs/reports/task-17/t17-live.mjs` → **99 passed / 0 failed**（P0 探针6 / P1 首页+懒加载+nav-cache / P2 收藏服务端同步 PUT-X-Fav-Sign-刷新保留-热度+1/+5-DELETE还原 / P3 降级不白屏 / P4 AI 工作台+流式+记忆会话+停止+清空+header 居中Δ≤2px / P5 admin 登录+热度榜+UV+统计+检测中心+打标改→验→还原 / P6 375 三页无溢出 / P7 暗色三端 / P8 还原线上数据）
- 补充「手动清单」脚本 `t17-manual.mjs` → **9 passed / 0 failed**（`/api` 不种 Set-Cookie · 搜索过滤+清空恢复 · 分类切换/刷新记忆 · 打字机暖心句 · 音乐播放器展开/收起）
- 线上数据还原核验：27 站 `favoriteCount` 全 0、热度榜无污染、tag 还原、主题回亮色、localStorage 收藏/会话/admin token 已清
- 证据：`dev-docs/reports/task-17/`（acceptance-log.txt · manual-checks.txt · netlog-live.txt 92 行 · 01~06 共 6 张截图，均过像素探针）

## 验证结果（2026-10-06 task-16 · M9-T1 完成后本地重跑）

- `npm run lint` → 0 警告 0 错误（oxlint）
- `npm run verify` → **52 passed / 0 failed**（task-16 改 1 增 2：[3B] 收藏服务端同步 4 条）
- `npm run build` → ✓ 307.96 kB / gzip 99.05 kB（AskPage 独立 chunk 23.54 kB + css 3.92 kB）
- task-16 CDP 浏览器验收脚本 → **49 passed / 0 failed**（收藏同步/离线降级/热度闭环/看板/暗色/375/防刷三层/限频 10 项清单 + 4 张截图像素探针自检）
- 后端冒烟脚本 → **20 passed / 0 failed**（no_visitor/visitor_mismatch/bad_sign/排序/+1/+5/幂等/防负/限频 35 连发/清理）
- 证据：`dev-docs/reports/task-16/`（acceptance-log.txt · netlog-favorites.txt · 01-04 截图）
- D1 migration 005 本地已执行 2 次幂等确认；线上探针（2026-10-06 早先）：`/api/ai/chat` 200 + GLM 流式（glm-4-flash）、`/api/stats/visits` 401、`/api/health` db:up ✓

## 交付清单（M1/M2/M3 详列 · M7/M8 摘要；M4/M5/M6 见里程碑表与各自任务卡）

### M1（functions 骨架 + 前端接入）
- `functions/api/{categories,sites,sites/[id],health}.js` + `_lib/{db,response}.js`
- `schema/migrations/001-init.sql`（categories/sites/site_stats 三表 + 5 分类 23 站种子）
- `wrangler.toml`（Pages + D1 binding DB）；`src/api/navApi.js`（3s 超时/信封校验/首帧快照/失败降级）
- 前端：HomePage 接 useNavData + 降级提示条；useFilterNav 数据源注入

### M2（管理面板 + 鉴权）
- `schema/migrations/002-admin.sql`（admin_attempts 登录锁定表）
- `functions/api/_lib/{auth,validate}.js`（HMAC-SHA256 token 8h、恒定时间密码比较、5 次失败锁 10min、SSRF 域名白名单、字段校验）
- `functions/api/admin/login.js`、`favicon.js`（SSRF 防护 + 8s 超时 + 占位 SVG 永不破图）
- `sites.js(+POST)`、`sites/[id].js(+PUT/DELETE)`、`categories.js(+POST)`、`categories/[id].js(+PUT/DELETE)`（**分类 key 禁改**）
- `src/admin/` 10 文件（独立模块零耦合主站）；App.jsx `/admin` 懒加载；HomePage tabs 由 groups 派生；useFilterNav activeCategoryKey 派生（effect-free 回落）
- 主站封面 favicon：navApi 归一化把 `favicon:<domain>` → `/api/favicon?domain=`（**组件零改动**）

### M3（链接检测）
- `schema/migrations/003-check.sql`（check_logs + 索引）
- `functions/api/_lib/checker.js`（HEAD→GET fallback 防误杀、5s 超时、并发≤4、429 不计失败、403 连续 2 次才死、毫秒级 last_checked_at 分批、30 天日志清理、时间预算）
- `functions/api/check/run.js`（POST 鉴权，siteId/batch/since，内存锁 429）+ `check/logs.js`（GET 鉴权，分页）
- **cron/ 独立 Worker**（`food-nav-link-check-cron`，Pages 不支持 scheduled，官方文档依据；`crons=["0 4 * * *"]` = 北京 12:00；多轮循环到 remaining=0，45s 预算）
- `src/admin/AdminChecks.jsx`（检测中心：手动触发 + 结果徽标 + 日志分页）+ AdminShell/AdminDashboard/AdminApi 扩展

### M7（AI 问答页布局打磨 · task-14）
- `src/ask/AskPage.jsx` header 去通栏毛玻璃 → 悬浮胶囊（rounded-[20px] bg-white/70 backdrop-blur + dark token）；双栏布局与滚动条净距打磨
- `src/styles/ask-theme.css` 暗色 token 组收敛（panels/气泡/chips/composer dark 变体）；375 移动端适配
- 验收：verify 50/50 + 3 张截图（`dev-docs/reports/task-14/`）

### M8（工作台重构 + 品牌「樱见」 · task-15 + 收尾补丁 task-15.1）
- 新增 `src/ask/AskWorkspace.jsx`（空态 3 列工作台：左插画问候大卡 + 右「今日美味」「最近会话」双面板，移动端单列可滚）；AskPage 条件渲染（无消息=工作台 / 有消息=纯净单栏），`<aside>` 侧栏彻底删除
- 新增 `src/ask/askHistory.js`（localStorage 记忆会话：800ms debounce 写入、结构校验读取、id 防撞、清空闭环）；「最近会话」面板 = 上次聊到 + 继续上次对话 / 无历史轻引导
- header：删分隔线、`grid-cols-[auto_1fr_auto]` 标题真居中（实测偏差 0px）、返回/清空改内联 SVG 图标按钮（`aria-label="回到主站"/"清空对话"` 字面保留）
- 品牌「樱见」：主站入口 `问问樱见` + 樱花五瓣 SVG（`HomePage.jsx` 仅入口按钮处，verify:664 文案已同步）；header 标题「樱见」+ 渐变 logo
- 滚动条：thumb `w-1.5`(6px) + `right-1`(4px)，消息容器 `pl-4 pr-7` → 内容↔thumb 净距 **18px**；`ask-theme.css` `.ask-thumb` <1024px `display:none`（小屏隐藏，JS 零改动）
- 验收：verify 50/50 + lint 0/0 + build ✓ + CDP 验收脚本 **100/100** + 6 张截图（`dev-docs/reports/task-15/`）

### M9-T1（收藏服务端化 + 热度闭环 · task-16）
- 新增 `schema/migrations/005-favorites.sql`（favorites 表，visitor_id+site_id 联合主键 + 站点索引，本地幂等 ×2）；`functions/api/_lib/visitor.js`（fv_id cookie / requireVisitor / favSign：`sha256(fvId+SALT).slice(0,32)`，本地恒定时间比较）
- 新增 `functions/api/favorites.js`（GET 列表 `{ok,data:[{siteId,name}]}`）+ `favorites/[id].js`（PUT/DELETE，扁平信封；校验顺序 同源→id→401 no_visitor→400 visitor_mismatch→401 bad_sign→限频 200 limited；限频桶 favorite 30/分/IP，401/400 不耗桶）
- `track.js` +`bumpSiteStatDelta`（收藏 +1/-1 → favorite_count & heat_score=收藏×5+点击，防负）；`db.js` SITE_COLUMNS + favorite_count/click_count + toSiteDto 字段
- 前端 `useFavorites.js` 重写（服务端同步层：initFavoritesSync GET 合并、toggleFavorite 乐观更新 + 同步 PUT/DELETE、**网络断开保留本地待下次合并 / 服务端拒绝回滚**）；`App.jsx` 停用 MutationObserver 收藏上报（点击上报/UV/主题保留）+ init 同步 effect；`HomePage.jsx` setSiteIndex；**NavCard/组件/index.css 零改动**
- 新增 `src/admin/AdminHeatBoard.jsx`（站点热度榜 Top10：# /站点 /分类 /收藏 /点击 /热度(高亮) / 空态）挂 AdminDashboard 底部；`AdminApi.fetchSites(status, sort)` 向后兼容
- .dev.vars（根 + functions/）`FAVORITE_SALT=<FAVORITE_SALT>`（前端常量同值）
- 验收：verify 52/52 + lint 0/0 + build ✓ + CDP **49/49** + 冒烟 20/20 + 4 张截图（`dev-docs/reports/task-16/`）；**2026-10-07 task-17 已部署上线并线上回归 99/99**（`dev-docs/reports/task-17/`）

## 线上部署状态

| 项 | 值/状态 |
|---|---|
| Pages 项目 | `food-nav`，地址 `https://food-nav-5eb.pages.dev`；自定义域 `food-nav.shiora.cc` ✅ 生效 |
| D1 库 | `food-nav-db`，id `b3f7564d-03d5-4ce0-b3ff-a252878dac96`；远程迁移 **001+002+003+004+005+006+007 已全部执行**（007-check-lock 于 2026-10-09 执行 ×2 幂等确认） |
| 生产 secrets | `ADMIN_PASSWORD` / `ADMIN_SECRET` / `GLM_API_KEY` / **`FAVORITE_SALT`** 均已 `wrangler pages secret put`（**值只在对话中传递，勿写入任何将提交的文件**；本地开发用 `functions/.dev.vars` 同步，已 .gitignore） |
| cron Worker | `food-nav-link-check-cron`，`crons=["0 4 * * *"]`（**task-22 随 checker.js 改动重部署**，version `79b39a46-b8ee-45ad-bed6-dcc8104be605`；部署顺序必须 cron 先、Pages 后） |
| **待部署** | **task-23（2026-10-10，纯前端）**：今日签 + 工作台极简，本地全绿（verify 54/54 · CDP 27/27），**等指挥官决定是否上线** → `npm run build && npx wrangler pages deploy dist --project-name food-nav`。线上当前版本 = **M10 + M9-T3 + M9-T4**，Pages deployment `625437fb.food-nav-5eb.pages.dev`（2026-10-09）。**回滚**：`npx wrangler pages deployment list --project-name food-nav` 回上一个 deployment → `c1bed251`（M9-T3）；再上 `42835c8a`（M10）。cron 可回 `b80cb8d5`；D1 007 为纯增量表可留不删 |
| 部署命令 | Pages：`npm run build && npx wrangler pages deploy dist --project-name food-nav`；cron：`npx wrangler deploy --config cron/wrangler.toml` |
| Cloudflare 账号 | 67a7b579cd22f292b900fd445e139cf9 |

## 环境信息

- 项目根 `E:\react\food-nav`（**是 git 仓库**：1 条基线 commit + 大量未提交变更——OpenCode 勿擅自 commit/push，用户未要求）
- Vite dev 端口 **5174**（5173 被占）；dev 下 `/api` 无代理 → 自动降级快照 + 提示条
- 本地 API：`npx wrangler pages dev dist --port 8788`；cron 本地：`npx wrangler dev --config cron/wrangler.toml`（**注意 cron 与 pages dev 是两个独立 miniflare D1 状态**：`cron/.wrangler` vs `.wrangler`，本地需分别迁移）
- 验证命令：lint / build / verify；`npx wrangler d1 execute food-nav-db --local --file schema/migrations/00X.sql`
- **PowerShell 写中文文件损坏 UTF-8** → 源码/SQL 只用编辑器工具改
- **CDP 验收浏览器必须保持可见**：窗口被遮挡/最小化 → `document.visibilityState='hidden'` → Chromium 节流 IntersectionObserver / setTimeout / 页面侧 awaitPromise → 懒加载卡片只出首屏、脚本假死。task-17 解法：以 `--remote-debugging-port=9222 --user-data-dir=<独立目录> --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion` 启动 + 窗口置前台；`t17/t20` 脚本开头已加可见性护栏（hidden 即 fail-fast exit 2）
- **本机 curl 走系统代理会挂/超时** → 一律加 `--noproxy *`（必要时 `--max-time 20`）；PowerShell 直接传 JSON body 会被转义搞坏 → 用 UTF-8 文件 + `--data-binary @file`；PowerShell 管道 `| Out-String` 到命令结束才出输出，长命令超时会丢结果
- **CDP 脚本写页面侧正则注意**：页面表达式若在 JS 模板字符串里，`\s`/`\d` 必须写成 `\\s`/`\\d`（否则模板求值后变 `s`/`d`，正则永不匹配——task-20 首轮 11 FAIL 的根因）；Node 端正则字面量则直接写 `\s`

## 🚫 禁止改动红线（长期有效）

1. 主站 UI/组件/交互零改动：`src/components/**`（**只允许新增文件**——MusicPlayer/PageDeco/effects 红线语义内已获准，不允许改现有文件）、`index.css`、`tailwind.config.js`
2. `src/data/navSources.js`：仅作 fallback 快照
3. `tests/verify.mjs`：断言语义不可破坏（现 **54** 条，task-23 起 52+2）；演进需走任务卡审批
4. 运行时依赖不新增（wrangler 仅 devDependency）
5. 生产 secrets 值禁止写入任何将提交 GitHub 的文件

## 已知遗留（写进后续任务卡）

1. ~~M6+M7+M8+M9-T1 未部署~~ → **已部署完成（2026-10-07 task-17，线上回归 99/99）**；保留回滚预案：`wrangler pages deployment list` 回滚上一个 deployment
2. **GLM 模型**：实测可用 **glm-4-flash**（glm-4.7-flash 429 过载、glm-4.5-flash 空内容）；后续被限流可回退 `GLM_MODEL` 环境变量换模型
3. **tinrry.com / dessertlab.cn / icecreamplanet.cn = 3 个真死链**（线上实测分别 526 / 530 / 530，Cloudflare 边缘「源站不可达」）→ 已按 task-18 方案 A 归网络层失败判 broken 并在主站隐藏；**OpenCode 不代删线上数据**，管理员可在 admin 删除或改 URL
4. **种子 2 个域名间歇失效**（mixuebingcheng.com、www.10000.com.cn 等偶发超时）→ 会被判 checking/broken，**下次 cron 会自动重测复活**（broken 已进候选 = 复活机制，task-18 已上线）；持续失效再修 URL
5. ~~**检测防重锁是 globalThis 内存锁（60s）**~~ → **task-22 已闭环**：D1 `check_lock` 原子锁（migration 007），cron 与手动检测跨 isolate 互斥；锁 TTL 60s，异常放行兜底
6. **网络层首败/瞬时超时会把站置 checking 并暂时隐藏**（`/api/sites` 默认只回 active）→ 属设计（弱信号过渡态），几小时内 cron/手动全量重测自动恢复；如需「只隐藏 broken」改 db.js 一行 `status IN ('active','checking')`
7. ~~**URL 封面外链失效破图**（favicon 模式有占位，纯 URL 模式没有）~~ → **task-22 已闭环**：NavCard img onError → setCoverFailed → CoverPlaceholder 兜底（布局/动画零变化）
8. **M9-T1 已知风险/遗留**：① M4 时代 favorite_count 由点赞频控粗放累计，**历史值可能高估，不回溯**（任务卡明示）；② 热度现为 `收藏×5+点击` 纯累计，**衰减公式 = M10 候选**；③ 本地 pages dev 所有请求 IP 恒为 `unknown` → 限频桶本地共享，自动化测试须跨分钟（脚本已处理）；④ 站点列表为空时 init 跳过上传，下次页面加载再合并（功能内自愈）；⑤ `FOAVORITE_SALT` 前端为公开常量（轻签名防误用，非密码学强鉴权，威胁模型见任务卡）
9. ~~**m3-api-tests 2 条期望过期**~~ → **task-18 已闭环**：由独立单测 `dev-docs/reports/task-18/t18-grade.mjs` 覆盖（**49/49**），无需再改历史脚本
10. ~~**检测超时固定 5000ms**~~ → **task-22 已闭环**：`CHECK_TIMEOUT_MS=8000`（最坏 HEAD+GET 16s < timeBudget 18s），线上全量验证 remaining=0、无连续超时误判

## 下一步（task-23 完成，等指挥官决策）

1. **task-23 部署决策**：今日签 + 工作台极简已全绿（纯前端），**默认不部署**；要上线执行 `npm run build && npx wrangler pages deploy dist --project-name food-nav`（cron/D1 零改动）。
2. **M10 后续候选**：热度衰减公式。细节与用户对齐后写任务卡。
3. M9 已全部关闭（T1~T4，task-16~22）；线上 27 站全 active。
