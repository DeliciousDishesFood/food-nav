# 食光导航 · 域名分配 + 热度统计 + M1 细化（研讨稿 v0）

> 状态：**待评审** · 生成：2026-10-03 · 副参谋
> 前置：02-backend-design.md（总设计稿）；本文件为 M1 阶段细化

---

## 一、域名分配设计（shiora.cc）

### 1.1 分配方案

| 子域 | 用途 | 说明 |
|---|---|---|
| **`food-nav.shiora.cc`** | 主站（前端 + API + 管理后台） | 唯一入口，推荐 |
| （不分配） | API 独立子域 | **不需要**：Pages Functions 与前端同源挂在 `/api/*`，这是零 CORS 的核心优势 |
| `quote.shiora.cc` | 已有服务（一言自身接口） | 不动，保持现状 |
| `www.shiora.cc` / 顶级域 | 保留（品牌主页等） | 不在本项目范围 |

### 1.2 解析与部署

- CNAME：`food-nav` → `<pages-project>.pages.dev`
- SSL：Cloudflare 自动（Full strict）
- **前置条件**：shiora.cc 的 DNS 需托管在 Cloudflare（Pages 自定义域要求）；若当前不在 Cloudflare，需迁移 NS（待确认）
- 国内访问优化（可选，M5）：Cloudflare 优选 IP / 第三方 SaaS CNAME 加速；主站域名配合 HSTS
- 备选子域（如 food-nav 被占/想要更短）：`nav.shiora.cc`（语义：导航站）

### 1.3 为什么 API 不单独开子域

- 同源（`https://food-nav.shiora.cc/api/*`）→ 浏览器零跨域、零 CORS 配置、Cookie/鉴权头无第三方限制
- 独立 API 子域（如 `api.shiora.cc`）只有在「前端与后端分属不同团队/独立扩容/独立安全域」时才值得；个人项目同源是压倒性优势

---

## 二、热度统计与防刷设计

### 2.1 数据模型

```sql
-- 站点统计（与主数据解耦，1:1 sites）
CREATE TABLE site_stats (
  site_id INTEGER PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  favorite_count INTEGER NOT NULL DEFAULT 0,  -- 收藏次数（历史累计）
  click_count INTEGER NOT NULL DEFAULT 0,     -- 点击次数（历史累计）
  heat_score INTEGER NOT NULL DEFAULT 0,      -- 热度值 = favorite_count*5 + click_count
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 2.2 热度公式（可调）

```
heat_score = favorite_count × 5 + click_count
```

- 收藏权重 5（收藏是强意图信号）；权重常量放后端配置，后续可调
- 只影响**排序参考**，**不打标签**——「热门 / 新品 / 推荐」标签由**管理员人工打标**（参考热度数据），杜绝"刷热度=刷标签"的动机

### 2.3 统计上报接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/stats/click` | `{siteId, fingerprint}` 点击上报 |
| POST | `/api/stats/favorite` | `{siteId, fingerprint, delta: 1|-1}` 收藏变更 |

前端：卡片覆盖链接点击（节流 10 分钟/站/指纹）、收藏切换时上报（fire-and-forget，失败静默）。

### 2.4 防刷方案（副参谋决定：**做基础防刷，不做签名/验证码**）

| 层 | 措施 | 说明 |
|---|---|---|
| 1 来源校验 | Origin/Referer 白名单（本站域名） | 同源部署下前端天然带；裸脚本直接 403 |
| 2 指纹限频 | KV：`stats:{siteId}:{fingerprint}` 窗口 | 点击 10min/次；收藏变更 24h/站/指纹 |
| 3 IP 限流 | Worker Rate Limiting | 统计接口按 IP 严格限流（如 60 次/分钟）；登录接口更严 |
| 4 熔断 | 单站 1 小时点击 > 100 次 → 暂停计入 24h | 防单点爆破（可选，M5 实现） |
| 5 不做 | 签名 / 验证码 / 行为验证 | 对个人站过度；且热度只影响排序、标签人工控制，损害有限 |

**为什么"做基础版"**：指纹 + 限频 + 来源校验代码量小（KV 窗口计数 ~30 行），挡住 90% 脚本盗刷；诚实说明：换 IP + 清指纹的真人无法 100% 防，但标签是管理员人工打的，刷热度顶多影响排序，损害可控。

### 2.5 排序与展示

- `GET /api/sites?sort=manual`（默认，sort_order 管理员排序）| `sort=heat`（热度排序，未来热门榜用）
- 管理面板：站点列表展示热度值 + 收藏/点击明细，辅助管理员打标
- 主站卡片默认仍按管理员 sort_order（热度只作为参考与可选排序，不改变现有视觉）

---

## 三、M1 后端骨架细化

### 3.1 架构决策：Pages Functions（非独立 Worker）

- 前端与 API **同仓库同源**：项目根 `functions/` 目录由 Pages 自动部署为 API 层
- D1 通过 binding 绑定（`wrangler.toml` 或 dashboard）
- 现有 `worker/` 目录（一言代理）保留独立（可后续并入 Functions）

### 3.2 M1 目录结构（新增，不碰现有组件）

```
functions/
└── api/
    ├── categories.js        # GET /api/categories
    ├── sites.js             # GET /api/sites（category/q/status/sort 参数）
    ├── sites/[id].js        # GET /api/sites/:id
    ├── health.js            # GET /api/health
    └── _lib/
        ├── db.js            # D1 binding + 查询封装
        └── response.js      # {ok,data}/{ok:false,error} 信封 + CORS 头（开发期）
schema/
└── migrations/
    └── 001-init.sql         # categories + sites + site_stats 建表 + 种子数据（现有 23 站 5 分类）
wrangler.toml                # Pages + D1 binding 配置
src/api/navApi.js            # 前端 API 客户端（拉取 + 归一化 + 降级快照）
src/data/navSources.js       # 【角色转变】保留为 fallback 快照（API 挂时兜底，主站永不白屏）
```

### 3.3 前端数据接入（解耦、零 UI 改动）

1. 新增 `src/api/navApi.js`：
   - `fetchCategories()` / `fetchSites()` → 归一化为现有 NavGroup 结构
   - **响应形状校验**：`json.ok && Array.isArray(json.data)`，否则视为失败
   - 失败 / 超时（3s）/ 非 2xx → 返回 null → 调用方走 `navSources.js` 快照
   - 顶部可选提示条「数据加载失败，显示本地快照」（不阻塞）
2. `HomePage` / `useFilterNav` 消费方式不变（数据源接口同构，注入式改造最小化）
3. 严格不动：渲染、搜索、收藏、主题、懒加载、播放器、打字机全部零改动

### 3.4 verify.mjs 契约演进（需用户知晓）

现状：fetch mock 对所有 URL 返回 `{hitokoto}`，且断言要求 `fetchCalls.every(含 '/quote-api/')`。
M1 引入 `/api/*` 请求后，mock 必须演进为**按路径路由**：
- `/quote-api/` → 原句子响应（原断言全部保留）
- `/api/` → 返回与本地快照同构的站点数据
- 断言：原 40 条语义不变，**新增 2 条**（数据接入成功 / 失败降级）→ **总数 40 → 42**
- `tests/verify.mjs` 仍由专人（OpenCode 按任务卡）演进，不破坏任何原断言语义

### 3.5 M1 验收清单

1. `wrangler dev` / Pages 本地运行：`/api/categories`、`/api/sites`、`/api/sites/:id`、`/api/health` 返回正确 JSON
2. 种子数据 = 现有 23 站 5 分类（与 navSources.js 一致，字段映射正确）
3. 前端：主站卡片来自 API；**拔掉后端 / 断网时自动降级本地快照**，页面不白屏
4. `npm run lint` 0/0 · `npm run build` ✓ · `npm run verify` **42/42**
5. UI 视觉零变化（截图对比）
6. 同源部署：`https://food-nav.shiora.cc/api/sites` 浏览器可访问，无 CORS 报错
7. 迁移脚本可重复执行（幂等）；`/api/health` 返回 db:up

### 3.6 M1 任务卡草稿（确认后转正）

```
先读 E:\react\food-nav\dev-docs\architecture\02-backend-design.md、03-m1-backend-detail.md、
E:\react\food-nav\src\data\navSources.js、E:\react\food-nav\src\pages\HomePage.jsx、
E:\react\food-nav\src\hooks\useFilterNav.js、E:\react\food-nav\tests\verify.mjs。

任务：M1 后端骨架——①functions/api/ 五个文件（categories/sites/sites[id]/health/_lib）②schema/migrations/001-init.sql（建表+23 站 5 分类种子数据）③wrangler.toml（Pages + D1 binding）④src/api/navApi.js（拉取+归一化+降级快照）⑤verify.mjs mock 按路径路由演进（原 40 断言语义全保留，新增 2 条数据接入断言）。
硬约束：主站 UI/组件/交互零改动；navSources.js 保留为 fallback 快照（不删）；不新增依赖；响应信封 {ok,data}；3s 超时；降级不白屏。
坑点：verify fetch mock 需按 /quote-api/ 与 /api/ 路由分发（见 3.4）；种子数据与 navSources.js 逐字段对齐（含 icon/coverImg/tag）；D1 binding 在本地用 wrangler dev --local 验证；PowerShell 写中文文件会损坏 UTF-8（源码用编辑器工具改）。
完成后按 3.5 验收清单逐项验证并汇报（含 2 张截图：正常 API 数据 / 断网降级快照）。
```
