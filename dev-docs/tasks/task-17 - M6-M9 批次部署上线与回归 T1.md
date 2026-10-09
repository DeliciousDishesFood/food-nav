# task-17 · M6-M9 批次部署上线 + 线上回归 T1

> 生成：2026-10-07 17:10 · 副参谋
> 前置必读：`dev-docs/STATUS.md`（待部署批次与命令）、task-13/14/15/16（M6-M9 交付记录）
> 前置状态：M1-M5 已上线（线上为 M5 版本）；M6+M7+M8+M9-T1 本地验证全绿（verify 52/52），**本任务把它们全部部署上线并回归**

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\dev-docs\STATUS.md`（部署命令/待部署批次/遗留）、本任务文档、`E:\react\food-nav\schema\migrations\005-favorites.sql`、`E:\react\food-nav\src\api\navApi.js`、`src\hooks\useFavorites.js`、`functions\_middleware.js`。

任务：**M6-M9 批次部署上线 + 线上全面回归**——按序执行 D1 migration 005 → FAVORITE_SALT secret → build → pages deploy → 线上探针 → 全量回归（主站/AI/admin/收藏/统计/检测/移动端），按本文「验收与汇报」出报告（含截图与 NetLog 证据）。

**部署前置**：
- 本地基线先全绿：`npm run lint`(0/0) · `npm run build` ✓ · `npm run verify`(**52/52**)
- 若 `npx wrangler whoami` 未认证 → 先 `npx wrangler login`（会话可能过期）

---

## 📋 部署步骤（按序执行，每步验证后再下一步）

### 1. D1 远程迁移 005
```
npx wrangler d1 execute food-nav-db --remote --file schema/migrations/005-favorites.sql
```
验证：输出含 `favorites` 表创建成功；再执行一次确认幂等（IF NOT EXISTS 不报错）。
线上探针：`curl -i https://food-nav.shiora.cc/api/favorites` → **401** `{code:'no_visitor'}`（无 cookie 被拒，接口已存在）。

### 2. FAVORITE_SALT secret
```
npx wrangler pages secret put FAVORITE_SALT --project-name food-nav
# 值：<FAVORITE_SALT>（必须与前端 useFavorites.js 常量同值，否则收藏 PUT/DELETE 全部 401）
```
验证：put 成功输出；不打印明文到仓库/日志。

### 3. 构建 + 部署（cron 不动）
```
npm run build && npx wrangler pages deploy dist --project-name food-nav
```
验证：输出 deployment URL 与上传文件数（Functions bundle 应包含 favorites/visitor 等新路由）。

### 4. 线上探针（部署后立即）
| 探针 | 期望 |
|---|---|
| `curl https://food-nav.shiora.cc/api/health` | `{"ok":true,"data":{"db":"up"}}` |
| `curl -i https://food-nav.shiora.cc/` | 200 + **Set-Cookie: fv_id=**（middleware 生效） |
| `curl -i https://food-nav.shiora.cc/api/favorites` | 401 no_visitor（接口存在，无 cookie 拒绝） |
| `curl -s -o /dev/null -w '%{http_code}' https://food-nav.shiora.cc/api/stats/visits?days=1` | 401（鉴权接口存在） |
| POST `https://food-nav.shiora.cc/api/ai/chat`（messages=[{role:user,content:"hi"}]） | 200 + SSE（GLM 流式，模型 glm-4-flash） |
| `https://food-nav.shiora.cc/api/sites?status=active` | 200 信封 + 站点列表 |

---

## ✅ 线上回归（CDP 驱动浏览器访问 https://food-nav.shiora.cc，非本地）

### 回归脚本
- 新建 `dev-docs/reports/task-17/t17-live.mjs`（参照 task-16 的 CDP 验收脚本思路，URL 改线上域名；独立浏览器、每用例隔离 localStorage/cookie）
- 覆盖断言（预计 30+ 条）：
  1. 首页 200 + fv_id cookie 存在 + 卡片来自 API（含 API 数据标记，无降级条）
  2. **收藏服务端化线上行为**：点收藏 → NetLog 见 PUT /api/favorites/{id}（带 X-Fav-Sign + body visitor_id=fv_id）→ 刷新保留 → 再取消 → DELETE + favorite_count 还原（**测完必须取消收藏，还原线上计数，不污染热度榜**）
  3. 断网/拦截 /api → 降级快照 + 提示条，不白屏
  4. **AI 页**：/ask 工作台「樱见」渲染（插画/问候/今日美味/最近会话）、发送 → GLM 流式 → 推荐卡片、记忆会话（刷新恢复）、纯净对话态、header 居中图标按钮
  5. **admin**：登录（ADMIN_PASSWORD 见 .dev.vars）→ 站点表格 → **热度榜看板**（收藏/点击/热度列）→ 访问统计 → 检测中心 → 打标
  6. **UV/热度**：/admin 计入 daily_visits；收藏 +1 → 热度 +5（看板可见）
  7. 移动端 375：主站/AI/看板无横向溢出
  8. 暗色模式：主站/AI/admin token 正常
- 截图（≥5 张，存 dev-docs/reports/task-17/）：
  - 01-live-home.png（线上主站，无降级条）
  - 02-live-favorite-sync.png（收藏同步 + NetLog 证据 netlog-live.txt）
  - 03-live-ask-workspace.png（AI 工作台「樱见」）
  - 04-live-heat-board.png（admin 热度榜看板）
  - 05-live-mobile-375.png（375）
  - 06-live-dark.png（暗色，可选）

### 手动清单（逐项 ✓/✗）
1. 线上主站：卡片/懒加载/搜索/分类记忆/主题切换/打字机/音乐播放器全正常（M1-M5 功能不回归）
2. 收藏：跨"设备"（不同浏览器/profile）验证——浏览器 A 收藏 → 浏览器 B 同 fv_id 看到？**注：fv_id 是 cookie 匿名标识，不同浏览器不同 fv_id 看不到彼此的收藏（无登录体系，属设计预期）——手动项改为：同一浏览器刷新/重进收藏保留 + 服务端列表正确**
3. AI 页「樱见」：工作台/对话/记忆会话/推荐卡片/停止
4. admin：CRUD/看板/统计/检测/打标（M2-M4 功能不回归）
5. middleware：首页 Set-Cookie fv_id、/api 不种 cookie、daily_visits 计数
6. 收藏计数还原：回归测完 favorite_count 与测试前一致（脚本自动取消收藏）
7. 375 无溢出、暗色正常
8. 降级不白屏（拦截 /api 快照 + 提示条）

---

## 🚫 禁止
- 部署前未全绿禁止 deploy；失败即停，不强行推进
- 不打印/不记录 FAVORITE_SALT 明文到仓库、日志、截图
- 不修改任何源码（本任务纯部署 + 验证；如发现线上 bug 记入遗留，不擅自改码）
- cron Worker 不重部署（M6-M9 未动 functions/checker）
- 不动线上数据：回归测完收藏/计数必须还原

## ⚠️ 坑点预警
1. **wrangler 登录态**：可能过期 → 先 whoami，未认证先 login
2. **fv_id 与收藏绑定**：不同浏览器/无痕是不同 fv_id → 收藏互不可见是预期（无登录体系），别当 bug
3. **回归脚本污染线上数据**：收藏测试必须收尾取消收藏（favorite_count 还原）；访问统计会真实 +1（可接受，说明）
4. **Pages Functions 缓存**：deploy 后 functions 立即生效；如探针异常先等 30s 重试，仍异常查 deploy 输出
5. **回滚预案**：若批次严重异常 → `npx wrangler pages deployment list --project-name food-nav` 找到上一个 deployment 回滚（或重新 deploy 旧 dist）；favorites 表可留（前端新代码已兼容）
6. **CDP 脚本同源**：访问线上页面同源发请求，无 CORS 问题；Cookie 需脚本上下文自动带（正常浏览器会话）
7. **PowerShell 写中文文件损坏 UTF-8** → 脚本用编辑器工具写

## ✅ 验收与汇报（按 task-16 格式）
1. 部署日志：migration/secret/build/deploy 每步输出与验证
2. 线上探针表（6 项逐条）
3. 回归结果：脚本通过数 + 手动清单 8 项逐条 + 截图 ≥5 张
4. 线上行为与本地差异说明（若有）
5. 遗留问题与风险（部署后发现的问题如实记录）
6. STATUS.md 更新：待部署批次清零、线上版本 = M9-T1、部署时间
