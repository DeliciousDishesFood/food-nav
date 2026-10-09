# task-16 · M9 收藏服务端化 + 热度闭环 + 轻签名 + 热度看板 T1

> 生成：2026-10-06 19:00 · 副参谋（已评审定稿）
> 前置必读：`dev-docs/STATUS.md`、task-9（M2 收藏/上报基线）、task-11（M4 埋点）、`src/hooks/useFavorites.js`、`src/App.jsx`（M4 埋点区）、`src/pages/HomePage.jsx`、`functions/api/_lib/{track,db,auth}.js`、`functions/api/sites.js`、`functions/_middleware.js`（fv_id cookie）、`src/admin/AdminApi.js`、`src/admin/AdminDashboard.jsx`、`tests/verify.mjs`（场景 [3B]）
> 前置状态：M1-M8 完成，verify 50/50；M6+M7+M8 未部署

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\dev-docs\STATUS.md`、本任务文档、`E:\react\food-nav\src\hooks\useFavorites.js`、`src\App.jsx`、`src\pages\HomePage.jsx`、`functions\api\_lib\track.js`、`functions\api\_lib\db.js`、`functions\api\_lib\auth.js`、`functions\_middleware.js`、`src\admin\AdminApi.js`、`src\admin\AdminDashboard.jsx`、`tests\verify.mjs`。

任务：**M9 收藏服务端化 + 热度真实闭环**——①favorites 表 + 收藏读写 API（GET 列表 / PUT 收藏 / DELETE 取消，写操作原子增减 favorite_count 并重算 heat）②**轻量防刷三层**：body visitor_id 必须等于 fv_id cookie（400）+ 收藏写限频（30/分/IP）+ X-Fav-Sign 轻签名（fv_id+salt 派生，防顺手改包）③前端 useFavorites 服务端同步（name→site_id 索引注入，卡片零改动；合并策略；乐观更新+失败回滚；离线降级本地）④**停用 App.jsx 收藏上报**（MutationObserver 只增不减是 M4 缺陷，且避免与 PUT 双计）⑤后台「站点热度榜」看板（Top10：收藏/点击/热度）。**热度衰减本轮不做**（写入遗留，等真实数据后设计可配置公式）。

硬约束：主站 `src/components/**`、`index.css`、`tailwind.config.js`、`vite.config.js`、`navSources.js` 零改动；**NavCard 零改动**（useFavorites 的 isFavorite(name)/toggleFavorite(name) 签名不变）；verify 50 语义演进（**改 1 增 2 → 52**，走本任务审批）；零新运行时依赖（签名用 Web Crypto，无库）。

完成后按本文「✅ 验收与汇报」逐项验证并汇报（含 3 张截图：收藏同步+刷新保留 / 热度榜看板 / 375 主站收藏无回归）。

---

## 📋 任务清单

### 1. schema/migrations/005-favorites.sql（新建）

```sql
CREATE TABLE IF NOT EXISTS favorites (
  visitor_id  TEXT    NOT NULL,
  site_id     INTEGER NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (visitor_id, site_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_site ON favorites (site_id);
```
幂等（IF NOT EXISTS），本地 + 远程执行。

### 2. functions/api/_lib/visitor.js（新建）—— visitor 校验 + 轻签名

- `getFvId(request)`：从 Cookie 解析 `fv_id`（middleware 已种一年期 cookie）；无 → null
- `requireVisitor(request)`：fv_id 缺失 → 401 信封 `{code:'no_visitor', message:'缺少访客标识'}`
- `verifyFavSign(request, fvId)`：校验请求头 `X-Fav-Sign` === `sha256hex(fvId + FAVORITE_SALT).slice(0, 32)`（Workers Web Crypto `crypto.subtle.digest`，复用 auth.js 的恒定时间比较函数若已导出）；不一致 → 401 `{code:'bad_sign'}`
- `FAVORITE_SALT` 来自 `env.FAVORITE_SALT`（pages secret；本地 `functions/.dev.vars` 同步——**前端常量与后端 secret 必须同值**，见任务 4）
- 注释写明局限：key 随前端 JS 公开，此层只防「顺手改包/批量换 visitor_id」，深度防刷靠 cookie 绑定 + 限频

### 3. functions/api/favorites.js（新建）—— 收藏读写 API

- **GET /api/favorites**：同源校验（复用 track.js 的 isSameOriginRequest）+ requireVisitor → `SELECT f.site_id AS site_id, s.name AS name FROM favorites f JOIN sites s ON s.site_id = s.id WHERE f.visitor_id = ? ORDER BY f.created_at DESC` → `{ok:true, data:[{siteId, name}]}`（name 供前端 name 级状态合并）
- **PUT /api/favorites/[id]**：同源 + requireVisitor + verifyFavSign + 限频（`overTrackLimit(db, clientIp(request), 'favorite', 30)`，超限静默 `{ok:true, favorited:null, limited:true}`）→ siteId 合法性（sites 表存在，否则 404 `{code:'site_not_found'}`）→ `INSERT OR IGNORE INTO favorites (visitor_id, site_id) VALUES (?, ?)` → **changes > 0 时** `bumpSiteStat(db, siteId, 'favorite')`（+1，heat 重算）→ `{ok:true, favorited:true}`
- **DELETE /api/favorites/[id]**：同源 + requireVisitor + verifyFavSign + 限频 → `DELETE FROM favorites WHERE visitor_id=? AND site_id=?` → **changes > 0 时** favorite_count **减 1**：扩展 track.js 的 bumpSiteStat（或新增 `bumpSiteStatDelta(db, siteId, kind, delta)`，内部 `favorite_count = MAX(0, favorite_count + delta)` + heat 同步重算，防止负值）→ `{ok:true, favorited:false}`
- **签名校验注意**：PUT/DELETE 必须校验；GET 可免（读操作，成本低，恶意读只拿自己的收藏列表，无收益）
- 限频 key 复用 'favorite' 桶（与 track/favorite 共用——但 track/favorite 前端将停用，无冲突）

### 4. 前端 useFavorites.js 改造（核心，卡片零改动）

**签名不变**：`isFavorite(name)` / `toggleFavorite(name)` / `useFavorites()`（NavCard 只调这些，禁改）。

**新增同步层**（模块级，沿用 useSyncExternalStore）：
- `setSiteIndex(groups)`：从 NavGroup 构建 `Map(name → siteId)`（站点改名后旧 name 收藏失效属预期，由合并策略兜底）
- `initFavoritesSync()`（App.jsx 挂载时调用一次）：
  1. 读 fv_id cookie（`document.cookie` 解析）
  2. `GET /api/favorites` → `[{siteId, name}]`
  3. 合并策略（并集，不丢收藏）：服务端有而本地无 → 加入本地；本地有而服务端无 → 记录待上传；写回 `food-nav:favorites` + emit
  4. 待上传项逐个 PUT（带签名）——失败静默（下次 init 再合并）
  5. 全部失败（断网/接口挂）→ 纯本地模式（降级，不弹错误）
- `toggleFavorite(name)` 内部扩展：
  1. 本地乐观更新 + 写 storage + emit（**原逻辑不动**）
  2. siteIndex 有 id + fv_id 存在 → 计算签名 → PUT/DELETE `/api/favorites/{id}`
  3. 请求失败 → **回滚本地**（恢复原列表 + 写 storage + emit）+ `console.warn('[favorites] 同步失败，已回滚')`
  4. siteIndex 无 id / 无 fv_id → 仅本地（离线可用）
- 签名实现（前端常量）：`const FAVORITE_SALT = '<FAVORITE_SALT>'`（**与服务端 secret 同值**）；`crypto.subtle.digest('SHA-256', new TextEncoder().encode(fvId + FAVORITE_SALT))` → hex 前 32 位 → 放 `X-Fav-Sign` header + body 带 `visitor_id: fvId`
- `storage.js` 的 STORAGE_KEYS.favorites 不变（food-nav:favorites 仍是本地权威缓存）

**挂载点**：
- `src/App.jsx`：`useEffect(() => { initFavoritesSync() }, [])`（新独立 effect，不并进埋点 effect）
- `src/pages/HomePage.jsx`：useNavData 后 `useEffect(() => { setSiteIndex(groups) }, [groups])`

### 5. 停用 App.jsx 收藏上报（防双计 + 修 M4 只增不减缺陷）

- App.jsx:88-123 MutationObserver 收藏分支：**删除收藏上报**（`report('/api/track/favorite', ...)` 与 FAVORITE_LABEL_RE 相关逻辑整块移除）
- 点击上报（onClick → `/api/track/click`）**原样保留**
- 说明：favorite_count 现在由 favorites PUT/DELETE 原子维护（有增有减），track/favorite.js 接口保留但前端不再调用（兼容）

### 6. 后台「站点热度榜」看板

- `functions/api/_lib/db.js`：SITE_COLUMNS 增加 `COALESCE(st.favorite_count, 0) AS favorite_count, COALESCE(st.click_count, 0) AS click_count`；toSiteDto 增加 `favoriteCount`/`clickCount`（主站不消费，无影响）
- `src/admin/AdminHeatBoard.jsx`（新建）：`fetchSites(status='all', sort='heat')` → 取前 10 → 表格：名次/站点/分类/收藏/点击/热度（heatScore），贴纸风格（border-2/shadow-foodSticker），热度列用 `text-food-primary font-bold`；无数据空态「暂无热度数据」
- `src/admin/AdminApi.js`：确认/补 `fetchSites(status, sort)` 签名（sort 透传 `?sort=heat`）
- `src/admin/AdminDashboard.jsx`：挂载「站点热度榜」区块（Tab「统计」内或独立卡片，位置你定，保持 dashboard 现有布局风格）
- **不加 verify 断言**（admin 看板用浏览器脚本验收）

### 7. verify 演进：50 → 52（语义审批）

- **改 1**：场景 [3B] 收藏断言——原「aria-pressed false→true → fetch 含 /api/track/favorite」改为**真实用户路径**：点击卡片爱心按钮 → 断言 fetch 含 `/api/favorites`（PUT）；再点取消 → 断言 DELETE（若原脚本是模拟 MutationObserver 触发，改为直接点按钮）
- **增 2**：①mount 后 `GET /api/favorites` 被调用（同步初始化）②收藏后本地 `food-nav:favorites` 含该站点
- fetch mock 新增 favorites 路由：GET → `{ok:true,data:[]}`（空历史，模拟新访客）；PUT/DELETE → `{ok:true,favorited:...}`（**mock 不模拟签名校验**——签名是服务端/浏览器脚本验的层，verify 保持稳定；jsdom 的 crypto.subtle 可用性不要依赖）
- 原 50 语义全保留（点击上报、降级、nav-cache 等不动）
- ⚠️ 收藏按钮点击在 verify 里需要 siteIndex 就绪（HomePage settle 后 groups 已注入）——断言前 await settle()

---

## 🚫 禁止改动

- `src/components/**`（NavCard 爱心按钮零改动）、`index.css`、`tailwind.config.js`、`vite.config.js`、`navSources.js`
- 点击上报（track/click）、UV middleware、主题/懒加载/搜索/分类记忆等全部现有功能
- track/favorite.js 接口本体（前端停用即可，接口保留兼容）
- verify 原 50 条语义（仅场景 [3B] 收藏断言按上面「改 1」演进）
- 运行时依赖不新增

## ⚠️ 坑点预警

1. **双计 bug**（本任务最大坑）：若保留 App.jsx 收藏上报 + PUT 计数 → 一次收藏 favorite_count +2 → **必须停用上报**（任务 5）
2. **取消收藏计数防负**：DELETE 后 `favorite_count = MAX(0, favorite_count - 1)`（M4 上报只增不减，服务端化后历史数据可能 favorite_count 被高估——不回溯，新逻辑从当前值起正确增减即可）
3. **name→id 映射**：站点改名后旧 name 收藏 → siteIndex 查不到 id → 仅本地保留（合并时 PUT 会 404？——PUT 前先查 siteIndex；查不到就不上传，本地保留）——**任务卡明确：PUT 前必须 siteIndex.has(name) 才传**
4. **签名 key 一致性**：前端常量 `FAVORITE_SALT`（值见 useFavorites.js，前端公开）与后端 `FAVORITE_SALT` secret 必须同值，否则线上 PUT/DELETE 全部 401 → 部署时 `wrangler pages secret put FAVORITE_SALT` + `.dev.vars` 同步（两处 .gitignore）
5. **fv_id 缺失场景**：直接打开 /ask 或未经过 middleware 的页面无 fv_id cookie → 收藏仅本地（降级正常，不报错）
6. **jsdom crypto.subtle**：verify 的 mock 不校验签名（见任务 7）；真实签名链路用浏览器脚本（CDP + pages dev）验证
7. **initFavoritesSync 时机**：App 挂载即 GET——middleware 必须在同一响应流种过 fv_id（页面请求先于 JS 执行，正常）；本地 pages dev 同理
8. **限频静默**：超限返回 `{ok:true, favorited:null, limited:true}`——前端视为成功（不回滚），避免误伤用户
9. **AdminHeatBoard**：fetchSites(status='all') 现有签名若只支持 status，加 sort 参数时**保持向后兼容**（不传 sort 默认 manual）
10. **PowerShell 写中文文件损坏 UTF-8** → 源码只用编辑器工具改

## ✅ 验收与汇报

### 验证命令
```
npm run lint · npm run build · npm run verify   # verify 52/52（改 1 增 2）
npx wrangler d1 execute food-nav-db --local --file schema/migrations/005-favorites.sql  # 幂等 ×2
npx wrangler pages dev dist --port 8788         # 本地联调
```

### 手动验证清单（逐项 ✓/✗）
1. **收藏同步**：主站点收藏 → NetLog 见 PUT /api/favorites/{id}（含 X-Fav-Sign、body visitor_id=fv_id）→ 刷新页面收藏保留（本地+服务端）；取消 → DELETE + favorite_count 减
2. **服务端列表**：GET /api/favorites 返回已收藏 [{siteId,name}]；无 cookie 访问 → 401 no_visitor
3. **防刷三层**：改 visitor_id 与 cookie 不符 → 400；无/错 X-Fav-Sign → 401 bad_sign；35 连点收藏 → 前 30 ok 后 limited（HTTP 200 静默）
4. **热度闭环**：收藏 +1 → 后台热度 +5；取消 → 热度 -5；`?sort=heat` 排序正确；**无 track/favorite 上报请求**（NetLog 确认）
5. **离线降级**：断网/后端挂 → 收藏仍可用（本地）、恢复后合并上传
6. **热度榜看板**：admin → 统计 → 站点热度榜 Top10（收藏/点击/热度三列、热度高亮、空态文案）；新收藏后榜内数值即时变化
7. **主站零回归**：爱心按钮样式/交互/aria-pressed 不变、懒加载/搜索/分类/主题/打字机/播放器全绿
8. verify 52/52 · lint 0/0 · build ✓
9. **375**：主站无横向溢出、看板表格可滚动不破版
10. 暗色：看板/主站收藏 token 正常

### 汇报格式
1. 改动清单（新增/修改文件 + verify diff：50→52 明细）
2. 验证结果（命令输出 + 清单 10 项逐条）
3. **3 张截图**：收藏同步验证（NetLog 证据 + 刷新保留）/ 热度榜看板 / 375 主站
4. 部署状态：默认不部署，给出命令 = `npx wrangler d1 execute food-nav-db --remote --file schema/migrations/005-favorites.sql` + `npx wrangler pages secret put FAVORITE_SALT --project-name food-nav` + `npm run build && npx wrangler pages deploy dist --project-name food-nav`（cron 不动）+ **部署后回滚说明**（删除 favorites 相关路由文件重新部署即可，favorites 表可留）
5. 遗留问题与风险（含热度衰减公式 M10 候选、M4 历史 favorite_count 高估不回溯说明）
