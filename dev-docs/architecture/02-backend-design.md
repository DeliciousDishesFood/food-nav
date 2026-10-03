# 食光导航 · 后端设计稿（研讨 v0）

> 状态：**待评审** · 生成：2026-10-03 · 副参谋
> 前置决策（用户已拍板）：Cloudflare Pages+Workers+D1 免费栈 · 仅导航卡片+分类后端化（收藏/主题留 localStorage）· 同仓库独立 admin 模块 · 有自定义域名（同源部署）
> 硬红线：主站 UI/交互/动画零改动；严格前后端解耦；后端不参与任何渲染

---

## 一、数据库设计（D1 / SQLite）

### 1.1 categories（分类）

```sql
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,            -- 'home-cooking' 等，前端 tab/路由稳定标识
  name TEXT NOT NULL,                  -- 展示名
  icon TEXT NOT NULL DEFAULT 'sparkles', -- Morphicons 名称
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 1.2 sites（站点卡片）

```sql
CREATE TABLE sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  desc TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'globe',    -- Morphicons 名称（前端渲染强绑定）
  cover_img TEXT NOT NULL DEFAULT '',    -- 三模式：空=内置插画(默认) | 'favicon:<domain>'=自动抓取 | 图片 URL
  tag TEXT NOT NULL DEFAULT '',          -- 角标（热门/新品）
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- active | broken | checking
  fail_count INTEGER NOT NULL DEFAULT 0, -- 连续检测失败次数
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sites_category ON sites(category_id, sort_order);
CREATE INDEX idx_sites_status ON sites(status);
```

### 1.3 check_logs（链接检测日志）

```sql
CREATE TABLE check_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ok INTEGER NOT NULL,                   -- 0 | 1
  status_code INTEGER,                   -- 0 = 网络错误/超时
  duration_ms INTEGER,
  note TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_check_logs_site ON check_logs(site_id, checked_at DESC);
```

### 1.4 鉴权（无状态 HMAC token，不建表）

- `ADMIN_PASSWORD`（环境变量）用于登录；`ADMIN_SECRET`（环境变量）用于签发 token
- `token = base64url(payload) + '.' + HMAC-SHA256(payload, ADMIN_SECRET)`
- payload：`{ exp: <8 小时后>, sub: 'admin' }`
- 校验：验签 + 过期；无需存储、无需 KV，天然无状态
- 登录限流：Worker Rate Limiting 按 IP（写接口更严）

### 1.5 迁移管理

- `schema/migrations/001-init.sql` … 编号递增；`wrangler d1 execute --file` 执行
- 版本记录在文档与 Git（当前非 git 仓库，M0 初始化）

---

## 二、接口规范（REST · 同源 /api）

### 2.0 通用约定

| 项 | 约定 |
|---|---|
| 前缀 | `/api`（Pages Functions 或 Worker 路由） |
| 响应信封 | 成功 `{ ok: true, data }`；失败 `{ ok: false, error: { code, message } }` |
| 鉴权 | `Authorization: Bearer <token>`（仅写接口/管理接口需要） |
| 幂等 | PUT/DELETE 幂等；POST 创建返回 201 + 实体 |
| 限流 | 读接口按 IP 宽松限流；写接口严格限流 + 登录失败限流 |
| CORS | 开发期（localhost:5174）配 ACAO；上线同源后无需 |

### 2.1 主站只读（无鉴权）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/categories` | 分类列表（sort_order 排序） |
| GET | `/api/sites?category=<key>&q=<词>&status=active` | 站点列表；默认只回 active；category 按 key；q 按 name+desc 模糊 |
| GET | `/api/sites/:id` | 单站详情 |
| GET | `/api/health` | `{ ok: true, db: 'up' }` 部署探测 |

站点响应字段对齐前端 NavItem 契约：`id, name, desc, url, icon, coverImg, tag`（camelCase，由后端映射）。

### 2.2 管理接口（Bearer token）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/admin/login` | `{password}` → `{token, expiresAt}` |
| POST | `/api/admin/logout` | 前端删 token 即可（无状态） |
| POST | `/api/sites` | 创建站点 |
| PUT | `/api/sites/:id` | 更新站点 |
| DELETE | `/api/sites/:id` | 删除站点（级联清 check_logs） |
| POST | `/api/categories` | 创建分类 |
| PUT | `/api/categories/:id` | 更新分类（key 变更需同步前端路由，预警） |
| DELETE | `/api/categories/:id` | 删除分类（级联删站点） |
| POST | `/api/check/run` | 手动触发全量/单站检测 |
| GET | `/api/check/logs?site_id=&limit=` | 检测日志 |

### 2.3 第三方 API 代理（M4 预留）

| 方法 | 路径 | 缓存 |
|---|---|---|
| GET | `/api/proxy/quote` | 一言 · 10min |
| GET | `/api/proxy/netease/songs?limit=` | 歌单 · 10min |
| GET | `/api/proxy/netease/url?id=` | 播放地址 · 30min |
| GET | `/api/proxy/netease/lyrics?id=` | 歌词 · 24h |

统一：5s 超时、失败透传、缓存键=路径+查询参数、保留现有本地兜底双保险。

---

## 三、管理员面板设计（同仓库独立模块）

### 3.1 形态

- 目录：`src/admin/`（独立树：AdminPage.jsx / AdminLogin.jsx / AdminSites.jsx / AdminCategories.jsx / AdminDashboard.jsx / adminApi.js）
- 路由：App.jsx 扩展：`/admin`（hash `#/admin` 与 pathname 均支持）→ `React.lazy(() => import('./admin/AdminPage.jsx'))` 独立 chunk
- **零耦合**：不 import 主站组件/hooks（仅共享 tailwind 设计 token 变量）；数据全走 adminApi（fetch /api）
- token 存 `localStorage['food-nav:admin-token']`（含过期时间，前端拦截 401 回登录页）

### 3.2 功能页

| 页面 | 功能 |
|---|---|
| 登录 | 密码输入 → 取 token → 跳仪表盘 |
| 仪表盘 | 站点总数 / 各分类数量 / 失效数 / 最近检测时间 / 快捷入口 |
| 站点管理 | 分类筛选、状态角标（active/broken/checking）、新增/编辑表单（名称/描述/URL/图标选择器/封面选择/排序/标签）、删除二次确认 |
| 分类管理 | 增删改、排序 |
| 检测中心 | 手动触发全量检测、检测日志表（时间/状态码/耗时/备注） |

### 3.3 关键 UI 组件（admin 内自建）

- **图标选择器**：从 `src/icons/registry.js` 导出名称清单，网格选择（管理员不填错名）
- **封面选择器**：三模式单选——① 内置插画枚举（covers/*.svg，**默认**）② 自动 favicon 抓取（`favicon:<domain>`，服务端解析 HTML `<link rel=icon>` 或走国内可访问的 favicon 服务）③ 自定义图片 URL
- 表单校验：URL 格式、名称必填、分类必选

---

## 四、链接存活检测机制

### 4.1 触发

- Cron Triggers：**每天 1 次全量**（免费计划 cron 数量/间隔以 Cloudflare 官方最新为准；23 站规模单次毫秒级）
- 管理员手动：`POST /api/check/run`（全量或指定 site_id）

### 4.2 检测算法（Worker）

1. 取 `status IN ('active','checking')` 的站点（全量 23 站无压力）
2. 每站 `fetch(url, { method:'HEAD', redirect:'follow', signal: 8s })`；HEAD 405 → fallback `GET`（只读，`Range: bytes=0-0`）
3. UA 标识：`food-nav-link-check/1.0 (+https://<域名>)`
4. 分级：
   - 2xx/3xx → `active`，`fail_count=0`
   - 4xx（429 除外）→ `fail_count+1`；`fail_count ≥ 2` → `broken`
   - 5xx / 超时 / 网络错误 → `checking`（弱信号，+1 计数但不直接标死；连续 2 次仍失败 → broken）
   - 429 → 不计失败（限流信号，本次跳过）
5. 写 `check_logs` + 更新 `sites.status/fail_count/last_checked_at`

### 4.3 前端过滤

- `GET /api/sites` 默认 `status=active`（broken 不展示）
- 预留：卡片角标「链接失效」灰色展示（M3 后续可选）

### 4.4 合规

- 低频（每天 1 次/站）、HEAD 优先、8s 超时、串行或 ≤3 并发（不给目标站压力）
- 不做内容抓取、不爬页面；对登录墙/风控站点（电商）策略可配置（仅 HEAD/跳过）
- UA 自述身份，接受目标站 robots 语义（可选实现）

---

## 五、风险分析与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| 国内访问 Cloudflare 直连不稳 | 高 | 已拍板接受；自定义域名 + 优选 IP（CNAME 加速）；备用前端国内 CDN 回源 |
| 第三方公益 API 随时挂 | 中 | M4 代理缓存 + 现有本地兜底双保险（一言 6 句 / SoundHelix 6 首） |
| 链接检测合规/误杀 | 中 | 低频 + HEAD 优先 + UA 自述 + 连续 2 次才标死 + 429 不计失败 |
| 数据备份 | 中 | Cron `wrangler d1 export` → R2；可选 GitHub Actions 定期拉取入库 |
| 管理员鉴权 | 中 | HMAC token 8h 过期 + 登录限流 + 密码仅存 env；可加 Cloudflare Access 挡 /admin |
| D1 限制 | 低 | 23 站规模无感；免费额度（5GB 存储 / 500 万行读/天）充裕 |
| 前端 API 挂 = 白屏 | **高** | 前端保留本地快照降级：navSources.js 转为 fallback 数据 + 顶部提示条 |
| 开发期 CORS | 低 | Worker 配 ACAO: http://localhost:5174；上线同源消失 |
| 收藏 name 匹配失联 | 中 | M5 迁移：sites 稳定 id 化后按 name 回填一次收藏数据 |

---

## 六、主动优化建议

1. **收藏 id 化**：后端化后收藏从 name 迁移到 id（兼容旧 localStorage 数据回填一次）
2. **图标选择器**：admin 内嵌 Morphicons 名称网格，杜绝填错
3. **封面三模式（用户已确认）**：内置插画枚举（默认，保持现有 /covers/*.svg）| 自动 favicon 抓取（`favicon:<domain>`，服务端解析或国内可访问服务）| 图片 URL；CoverPlaceholder 逻辑不动
4. **迁移版本化**：schema/migrations/ 编号 SQL
5. **播放器 uid 配置化（M4）**：网易云 uid 从后端配置读，避免改代码发版
6. **PWA（远期）**：静态资源 Service Worker，主站体验提升（与后端无关）

---

## 七、里程碑路线图

| 里程碑 | 目标 | 边界（完成标志） |
|---|---|---|
| **M0 文档化**（进行中） | README / 架构说明 / 技术栈清单 / 研讨文档入 Git | docs/ 齐全 + Git 仓库初始化 + 首次提交 |
| **M1 后端骨架** | Cloudflare 初始化、D1 迁移、categories/sites 只读 API、同源部署、前端数据接入 | API 通；主站卡片来自后端；API 挂时本地快照降级；UI 零改动 |
| **M2 管理面板** | /admin 路由 + 登录 + 站点/分类 CRUD + 图标/封面选择 | 管理员可增删改站点并即时生效主站 |
| **M3 链接检测** | Cron + 检测 Worker + 状态标记 + 前端过滤 + 日志 + 手动触发 | 失效站点自动标 broken 且主站隐藏 |
| **M4 第三方代理** | 一言/网易云三接口代理 + 缓存 + 降级 | 主站不再直连任何公共 API |
| **M5 加固** | 备份自动化、登录限流、错误监控、收藏 id 迁移、性能审计 | 全部验收清单通过 |

每里程碑独立验收、可发布，不阻塞后续。
