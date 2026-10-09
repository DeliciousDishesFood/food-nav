# task-9 · M2 管理面板（登录 + CRUD + 图标/封面选择）T1

> 生成：2026-10-04 · 副参谋（已评审定稿）
> 前置必读：`dev-docs/STATUS.md`、`dev-docs/architecture/02-backend-design.md`（§三 管理面板、§二 接口规范）、`03-m1-backend-detail.md`
> M1 已收官：DNS `food-nav.shiora.cc` 已生效（`/api/health` 返回 db:up），线上 API 全通

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\dev-docs\STATUS.md`（项目状态，含红线与遗留）、`E:\react\food-nav\dev-docs\architecture\02-backend-design.md`（管理面板设计 §三 + 接口规范 §二）、`E:\react\food-nav\dev-docs\architecture\03-m1-backend-detail.md`、本任务文档、`E:\react\food-nav\src\App.jsx`、`E:\react\food-nav\src\api\navApi.js`、`E:\react\food-nav\src\hooks\useFilterNav.js`、`E:\react\food-nav\src\pages\HomePage.jsx`、`E:\react\food-nav\src\icons\registry.js`、`E:\react\food-nav\src\components\CategoryTabs.jsx`、`E:\react\food-nav\src\components\NavCard\NavCard.jsx`、`E:\react\food-nav\functions\api\sites.js`、`E:\react\food-nav\functions\api\sites\[id].js`、`E:\react\food-nav\functions\api\categories.js`、`E:\react\food-nav\functions\api\_lib\response.js`、`E:\react\food-nav\functions\api\_lib\db.js`、`E:\react\food-nav\tests\verify.mjs`。

任务：**M2 管理面板**——① 后端：HMAC 登录鉴权 + 登录失败锁定 + 站点/分类 CRUD + favicon 代理 ② 前端：`src/admin/` 独立模块（登录/仪表盘/站点管理/分类管理/图标选择器/封面三模式）+ `/admin` 路由（App.jsx 懒加载）③ 主站分类 Tab 数据源切 API（M1 遗留）④ verify 40→42→45。

硬约束：**主站 `src/components/**` 零改动（CoverPlaceholder/NavCard 不许碰——favicon 用 navApi 转换方案，见下）**；`navSources.js`/`index.css`/`tailwind.config.js` 不动；verify 原 42 断言语义全保留，新增 3 条；运行时依赖不新增；admin 与主站逻辑零耦合（不 import 主站组件/hooks）。

完成后按本文「✅ 验收与汇报」逐项验证并汇报（含 3 张截图）。

---

## ⚠️ 首步环境检查

1. `npx wrangler whoami` 登录态（M1 已验证过，会话可能过期需重登）
2. 生产 secret：`npx wrangler pages secret put ADMIN_PASSWORD`、`ADMIN_SECRET`（Pages 项目 food-nav）；本地开发用 `functions/.dev.vars`（`ADMIN_PASSWORD=...`、`ADMIN_SECRET=...`，**不要提交**，.gitignore 加 `.dev.vars`）
3. D1 迁移：`npx wrangler d1 execute food-nav-db --local --file schema/migrations/002-admin.sql`（本地）+ 远程同命令（不带 --local）

---

## 📋 任务清单

### 1. 后端：schema/migrations/002-admin.sql

```sql
-- 登录失败锁定（按 IP）
CREATE TABLE IF NOT EXISTS admin_attempts (
  ip TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 2. 后端：_lib/auth.js（新增）

- `signToken(secret, payload, ttlMs)`：HMAC-SHA256 签名，token = `base64url(JSON).signature`（Web Crypto `crypto.subtle`，Workers 原生支持）
- `verifyToken(token, secret)` → payload | null（验签 + `exp` 过期）
- `checkPassword(input, env)`：**恒定时间比较**（`crypto.subtle` 或逐字节 XOR 比较，勿用 `===`）
- `requireAuth(request, env)`：解析 `Authorization: Bearer <token>`，失败抛 `{code:'unauthorized'}` → 响应 401 `{ok:false,error:{code:'unauthorized',message:'登录已过期，请重新登录'}}`
- 登录限流：`lockCheck(ip, db)` / `registerFail(ip, db)` / `registerSuccess(ip, db)`——admin_attempts 表；5 次失败 → locked_until = now+10min；锁定期间一律 429 `{code:'too_many_attempts'}`；成功清零

### 3. 后端：管理接口（新增/扩展）

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/admin/login` | 无 | `{password}` → `{ok,data:{token,expiresAt}}`；锁定 429；错误密码 401 |
| POST | `/api/sites` | ✅ | 创建 → 201 `{ok,data:siteDto}`（toSiteDto 复用） |
| PUT | `/api/sites/[id]` | ✅ | 更新 → `{ok,data:siteDto}`；不存在 404 |
| DELETE | `/api/sites/[id]` | ✅ | 删除 → `{ok:true}`（site_stats 级联） |
| POST | `/api/categories` | ✅ | 创建；key 冲突 409 |
| PUT | `/api/categories/[id]` | ✅ | 更新；**key 禁止修改**（前端路由以 key 为标识，改 key 会断链）→ 若 payload 带 key 且与现值不同 → 400 |
| DELETE | `/api/categories/[id]` | ✅ | 删除（sites 级联）；删除后主站该分类消失 |
| GET | `/api/favicon?domain=` | 无 | 见下「favicon 代理」 |

- 文件落点：`categories.js` 加 `onRequestPost`；新建 `categories/[id].js`（PUT/DELETE）；`sites.js` 加 `onRequestPost`；`sites/[id].js` 加 `onRequestPut`/`onRequestDelete`；新建 `admin/login.js`
- 写接口字段校验（_lib/validate.js 新增）：
  - sites：`name` 必填 ≤50；`url` 必须 `https?://` 合法 URL ≤300；`desc` ≤100；`icon` 非空字符串；`cover_img` 三模式（空 | `favicon:<合法域名>` | http(s) URL）；`tag` ≤10；`categoryId` 必须存在（查 categories）；`sortOrder` 整数 ≥0
  - categories：`key` 必填 `^[a-z0-9-]+$`；`name` ≤20；`icon` 非空；`sortOrder` ≥0
  - 校验失败 → 400 `{ok:false,error:{code:'validation_error',message}}`
- **favicon 代理** `GET /api/favicon?domain=`：
  - domain 校验（**防 SSRF**）：`/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i`；拒绝 IP / localhost / 内网段（`127.`、`192.168.`、`10.`、`172.16-31.`）
  - fetch `https://<domain>/favicon.ico`（8s 超时、UA `food-nav-favicon/1.0`、redirect follow）
  - 成功 → 返回原图字节 + `cache-control: max-age=86400` + 正确 content-type
  - 失败 → 返回内置 SVG 占位图（灰色小盘子插画，`image/svg+xml`）——**前端永不破图**（NavCard 无 onerror，靠后端兜底）

### 4. 前端：src/admin/（独立模块，零耦合主站）

```
src/admin/
├── AdminApi.js          # fetch 封装：base /api，自动带 Bearer；401 → 清 token + 触发 customEvent('admin-logout')
├── AdminPage.jsx        # 容器：localStorage 无有效 token → <AdminLogin/>，有 → <AdminShell/>
├── AdminLogin.jsx       # 密码表单（贴纸风卡片）；错误提示；锁定提示（429）
├── AdminShell.jsx       # 顶栏（「食光管理台」+ 登出按钮）+ 内部 Tab（仪表盘 / 站点 / 分类）
├── AdminDashboard.jsx   # 统计卡：站点总数 / 分类数 / 失效数 / 最近检测时间（数据：GET /api/sites?status=all + /api/categories 前端统计）
├── AdminSites.jsx       # 站点表格：分类筛选、状态徽标（active/broken/checking）、排序、编辑/删除按钮；「新增站点」按钮 → 打开表单
├── AdminSiteForm.jsx    # 表单（Modal 或内联）：name/desc/url/icon 选择器/分类下拉/封面三模式/tag/sortOrder；校验提示；保存/取消
├── AdminCategories.jsx  # 分类表格：增/改/删（key 显示不可编辑，删除二次确认——提示「将同时删除该分类下所有站点」）
├── IconPicker.jsx       # 图标网格：`Object.keys(iconRegistry)`（从 src/icons/registry.js 导入，仅此一处跨模块引用，只读图标名列表）
└── AdminFallback.jsx    # lazy 加载 fallback（贴纸风 loading 卡）
```

- token 存储：`localStorage['food-nav:admin-token']` = `{token, expiresAt}`；AdminPage 校验 `expiresAt > now` 否则清掉回登录
- 样式：沿用贴纸风 token（`bg-food-surface`/`border-food-line`/`shadow-foodSticker`），布局偏管理表格（密度高、信息完整），**不引入任何新依赖**
- 封面三模式单选：
  1. 内置插画（默认）：12 个枚举缩略图网格（`/covers/{noodle,dish,dessert,cake,icecream,burger,delivery,coffee,milktea,fries,fruit,market}.svg`）→ 存相对路径 `/covers/xxx.svg`
  2. 自动 favicon：域名输入框 → 存 `favicon:<domain>`
  3. 图片 URL：输入框 → 存 URL
- 字段为空时后端/表单按空处理（主站显示内置占位插画）

### 5. App.jsx 路由（唯一允许修改的主站入口文件）

```jsx
const AdminPage = lazy(() => import('./admin/AdminPage.jsx'))
// path === '/' → HomePage；'/admin' → <Suspense fallback={<AdminFallback/>}><AdminPage/></Suspense>；其余 NotFound
```
- hash `#/admin` 与 pathname `/admin` 均可达（现有 getPath 已支持）

### 6. 主站分类 Tab 数据源切 API（M1 遗留）

- `navApi.js` `normalizeNavData`：group 增加 `icon`（取 categories 的 icon 字段）
- `HomePage.jsx`：`categoryTabs` 从 `groups` 派生：
  ```
  [{key:'all',label:'全部',icon:'sparkles'}, {key:'favorites',label:'我的收藏',icon:'heart'}, ...groups.map(g=>({key:g.categoryKey,label:g.categoryName,icon:g.icon}))]
  ```
  不再用 `getCategoryList()`
- `useFilterNav.js`：`normalizeCategory` 校验集合从 `getCategoryList()` 改为 **navList 的 keys**（`[all, favorites, ...navList.map(g=>g.categoryKey)]`）；新增 `useEffect`：groups 更新后若 `activeCategoryKey` 不在新 keys 中 → 回 `all`（管理员删分类后主站不残留失效 key）
- **favicon 渲染零组件改动**：`navApi.js` 归一化时把 `coverImg === 'favicon:<domain>'` 转换为 `/api/favicon?domain=<domain>`（普通 URL 交给 NavCard 现有 `<img>` 路径；后端失败返回占位图 → 永不破图）

### 7. verify.mjs 演进（42 → 45）

- mock 扩展（按 URL 路由追加）：
  - `/api/admin/login`：apiMode ok → `{ok:true,data:{token:'test-token',expiresAt:Date.now()+8h}}`；fail → 401
  - 写接口（POST/PUT/DELETE /api/）：apiMode ok → `{ok:true,data:{...}}`
- **新增 3 条断言**：
  1. `/admin` 路由渲染登录页（导航到 `#/admin`，无 token → 出现密码输入框）
  2. 模拟登录成功 → 面板可见 + token 写入 localStorage（填密码提交 → mock 返回 token → AdminShell 渲染）
  3. 管理面板站点列表来自 `/api/sites?status=all`（断言出现 API_MARKER 或断言 fetch 调用包含 status=all）
- 原 42 条语义全保留（categoryTabs 从 groups 派生后，注意 `active tab is all`、`baking tab shows 5 cards` 等断言仍成立——mock API_SITES 须含 5 分类对应站点与 icon 字段）

---

## 🚫 禁止改动

- `src/components/**`（**含 CoverPlaceholder.jsx / NavCard.jsx**——封面/占位渲染全部不动）
- `src/data/navSources.js`（fallback 快照原样）
- `src/index.css` / `tailwind.config.js` / `vite.config.js` / `package.json`（零依赖变更）
- verify.mjs 原 42 条断言语义
- 现有功能：懒加载/IO/星星视差/毛玻璃导航/卡片 hover/樱花滚动条/播放器/打字机/主题/收藏/搜索

## ⚠️ 坑点预警

1. **verify mock 路由顺序**：`/quote-api/` 必须在 `/api/` 前判断（quote URL 含 `/api/` 子串，M1 已如此）
2. **admin lazy chunk 在 verify**：React.lazy + Suspense 需等动态 import 完成（断言前 await 或 waitFor 轮询；参考 verify 现有 waitFor 模式）
3. **HMAC 用 Web Crypto**（`crypto.subtle`）：Workers 运行时原生支持；勿用 Node `crypto` 模块（wrangler pages dev 是 Workers 环境）
4. **恒定时间比较**：密码比对防时序攻击
5. **SSRF**：favicon domain 严格校验（IP/localhost/内网段拒绝）
6. **categories key 禁改**：PUT 时 payload.key 与现值不同 → 400
7. **删除分类**：前端二次确认提示级联删除站点
8. **token 存储**：localStorage + Bearer（勿用 cookie）；expiresAt 过期检查
9. **登录限流表**：migration 002 本地 + 远程都要执行；`wrangler d1 execute` 幂等（IF NOT EXISTS）
10. **`.dev.vars` 不入库**（.gitignore 追加）；`ADMIN_PASSWORD/ADMIN_SECRET` 生产走 `wrangler pages secret put`
11. **Pages Functions 方法分发**：`onRequestPost/onRequestPut/onRequestDelete` 导出；同一文件可多方法并存
12. PowerShell 写中文文件损坏 UTF-8 → 源码/SQL 只用编辑器工具改

## ✅ 验收与汇报

### 验证命令
```
npm run lint · npm run build · npm run verify   # verify 45/45，原 42 全绿
npx wrangler d1 execute food-nav-db --local --file schema/migrations/002-admin.sql  # 幂等
npx wrangler pages dev dist --port 8788         # 本地 API 全流程
```

### 手动验证清单（逐项 ✓/✗）
1. 登录：错密码 401 且提示；对密码 → token 写入 localStorage、进面板；**连续 5 次错密码 → 429 锁定 10 分钟**
2. 无 token / 坏 token 调写接口 → 401 信封；前端自动回登录页
3. 新增站点（含 icon 选择器、封面三模式各选一次）→ 保存后**主站立即可见**（卡片/图标/封面/角标正确）
4. 编辑站点（改名称/排序）→ 主站更新；删除站点 → 主站消失
5. 新增分类 → **主站 Tab 出现**并可切（Tab 数据源切 API 生效）；删除分类 → Tab 消失 + 该分类站点消失
6. favicon：`/api/favicon?domain=github.com` → 图片 200；`127.0.0.1`/`localhost`/非法域 → 400；不存在 favicon 的域 → 占位图（不破图）
7. 登出 → 回登录页；刷新面板 token 有效期内免登录
8. `/admin` 与 `#/admin` 均可达；404 页不受影响
9. verify 45/45 · lint 0/0 · build ✓；主站原有功能全绿
10. 移动端 375px：admin 面板无溢出；主站分类 Tab 横向滚动正常

### 汇报格式
1. 改动清单（新增文件 + 修改文件 + verify diff）
2. 验证结果（命令输出 + 清单 10 项逐条）
3. **3 张截图**：admin 面板（含站点表格）/ 主站出现管理员新增站点 / 移动端 375
4. 部署状态：本地全量验证 + 线上是否部署（含 secret 配置情况）；未部署给出命令
5. 遗留问题与风险
