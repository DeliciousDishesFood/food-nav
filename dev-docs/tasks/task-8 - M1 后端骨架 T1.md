# task-8 · M1 后端骨架（Cloudflare Pages Functions + D1）T1

> 生成：2026-10-03 · 副参谋（已评审定稿）
> 总设计稿：`dev-docs/architecture/02-backend-design.md`、`03-m1-backend-detail.md`
> 域名已定：`food-nav.shiora.cc`（DNS 已在 Cloudflare）

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\dev-docs\architecture\02-backend-design.md`、`E:\react\food-nav\dev-docs\architecture\03-m1-backend-detail.md`、本任务文档、`E:\react\food-nav\src\data\navSources.js`（种子数据来源）、`E:\react\food-nav\src\pages\HomePage.jsx`、`E:\react\food-nav\src\hooks\useFilterNav.js`、`E:\react\food-nav\tests\verify.mjs`（fetch mock 演进点）、`E:\react\food-nav\vite.config.js`、`E:\react\food-nav\package.json`。

任务：**M1 后端骨架**——① `functions/api/` 五个文件（categories / sites / sites/[id] / health / `_lib`）② `schema/migrations/001-init.sql`（建表 + 23 站 5 分类种子数据）③ `wrangler.toml`（Pages + D1 binding）④ 前端 `src/api/navApi.js`（拉取 + 归一化 + 降级快照）⑤ `tests/verify.mjs` fetch mock 按路径路由演进（原 40 断言语义全保留，新增 2 条，总数 40→42）。

硬约束：**主站 UI/组件/交互零改动**；`navSources.js` 保留为 fallback 快照（不删不改结构）；运行时依赖不新增（允许新增 devDependency `wrangler`）；API 响应信封 `{ok,data}` / `{ok:false,error}`；前端拉取 3s 超时、失败降级本地快照、永不白屏。

完成后按本文「✅ 验收与汇报」逐项验证并汇报（**含 2 张截图**：正常 API 数据 / 断网降级快照）。

---

## ⚠️ 首步环境检查

1. `npx wrangler whoami` → 是否已登录 Cloudflare？（无登录态：**本地全量验证照做，部署步骤给出命令由用户执行**，不要阻塞）
2. `npx wrangler d1 create food-nav-db`（首次）→ 把返回的 `database_id` 填入 `wrangler.toml`
3. 本地开发验证用 `wrangler pages dev dist`（先 `npm run build`）或 `wrangler dev`；D1 本地用 `--local`

---

## 📋 任务清单

### 1. functions/api/（Pages Functions，路径即路由）

```
functions/
└── api/
    ├── categories.js        # GET /api/categories
    ├── sites.js             # GET /api/sites
    ├── sites/[id].js        # GET /api/sites/:id
    ├── health.js            # GET /api/health
    └── _lib/
        ├── db.js            # context.env.DB 封装 + 查询
        └── response.js      # ok()/fail() 信封 + 开发期 CORS 头
```

**接口规格**：

| 方法 | 路径 | 参数 | 返回 |
|---|---|---|---|
| GET | /api/categories | — | `{ok,data:[{id,key,name,icon,sortOrder}]}` 按 sortOrder |
| GET | /api/sites | `category=<key>` `q=<词>` `status=active(默认)` `sort=manual(默认)\|heat` | `{ok,data:[{id,categoryId,categoryKey,name,desc,url,icon,coverImg,tag,sortOrder,status,heatScore}]}` 平铺数组 |
| GET | /api/sites/:id | — | 单站；无 → `{ok:false,error:{code:'not_found'}}` 404 |
| GET | /api/health | — | `{ok:true,data:{db:'up',time}}` |

- `q` 按 name+desc 模糊（LIKE %q%，大小写不敏感）
- 默认只返回 `status='active'`（broken 过滤，已确认）
- `sort=heat` 按 heat_score DESC（本期有字段即可，前端暂不调用）
- `_lib/response.js` 的 CORS：开发期（本地 wrangler dev 端口）允许 `http://localhost:5174`；生产同源无需——用环境判断或简单允许两个来源，写清楚注释

### 2. schema/migrations/001-init.sql

三张表（SQL 以 `02-backend-design.md` 为准）：`categories` / `sites` / `site_stats`（建表 + 索引）。

**种子数据**：从 `navSources.js` 逐项迁移（字段对照）：

| navSources.js | DB 列 | 说明 |
|---|---|---|
| categoryKey | categories.key | 唯一 |
| categoryName | categories.name | |
| icon（分类） | categories.icon | |
| — | categories.sort_order | 数组索引 0..n |
| item.name | sites.name | |
| item.desc | sites.desc | |
| item.url | sites.url | |
| item.icon | sites.icon | |
| item.coverImg | sites.cover_img | 原值如 `/covers/noodle.svg`（保持相对路径，同源可访问） |
| item.tag | sites.tag | 无则空串 '' |
| — | sites.category_id | 对应 categories.id（子查询或显式 id） |
| — | sites.sort_order | 组内数组索引 |
| — | sites.status | 全部 'active' |
| — | site_stats | 每站一行 0 值（favorite_count=0, click_count=0, heat_score=0） |

种子 SQL 用显式 id（1..5 分类、sites 1..23）保证可重复执行（INSERT OR REPLACE / 显式 id 幂等）。

### 3. wrangler.toml

```toml
name = "food-nav"
pages_build_output_dir = "dist"
compatibility_date = "2026-10-03"

[[d1_databases]]
binding = "DB"
database_name = "food-nav-db"
database_id = "<d1 create 返回的 id>"
```

### 4. src/api/navApi.js（前端数据接入，零 UI 改动）

- `fetchNavData()`：并行拉 `/api/categories` + `/api/sites`（AbortController 3s 超时）
- **响应形状校验**：`json.ok === true && Array.isArray(json.data)`，否则视为失败
- 归一化：平铺 sites → `[{categoryKey, categoryName, items:[{id,name,desc,url,icon,coverImg,tag}]}]`（与 navSources.js 结构同构，字段用 camelCase）
- 失败 / 超时 / 非 2xx → 返回 `null`
- 接入点：`HomePage.jsx` 用 `useNavData`（新 hook 或 navApi 内组合）——API 成功用后端数据，失败用 `navSources.js` 快照；数据源注入 `useFilterNav`（改其签名支持外部数据源，或包一层），**HomePage 渲染逻辑不动**
- 可选：降级时顶部提示条「数据加载失败，显示本地快照」（不阻塞、可关）

### 5. tests/verify.mjs 演进（40 → 42）

**fetch mock 改为按路径路由**：

```js
window.fetch = async (url) => {
  fetchCalls.push(String(url))
  await delay(120)
  const u = String(url)
  if (u.includes('/quote-api/')) return jsonResp({ hitokoto: REMOTE_QUOTE, type: 'a' })
  if (u.includes('/api/')) return jsonResp({ ok: true, data: FALLBACK_NAV }) // 与 navSources 同构的站点数据（可在测试内构造）
  return jsonResp({ hitokoto: REMOTE_QUOTE })
}
```

- **fetchCalls 断言调整（语义保留）**：原 `fetchCalls.every(u => u.includes('/quote-api/'))` 因引入 `/api/` 请求必然 FAIL → 改为：quote 请求仍走同源代理（对含 `/quote-api/` 的调用检查）+ 新增 API 调用检查（`some(u => u.includes('/api/'))`）。原断言「dev 同源代理修复 CORS」语义不变
- **新增 2 条断言**：① API 数据接入成功 → 卡片渲染来自 mock API（断言某一站点名来自 FALLBACK_NAV）② API 失败降级 → mock 对该请求抛错（临时 stub 或第二个场景）→ 页面渲染 navSources 快照、不白屏
- 原 40 条断言逐条保留（其余场景不动）

---

## 🚫 禁止改动

- `src/components/**`、`src/hooks/useFilterNav.js`（只允许改其数据源注入签名，渲染逻辑不动）、`src/pages/HomePage.jsx`（只允许接入 useNavData 数据源）、`src/index.css`、`tailwind.config.js`
- `src/data/navSources.js`：**保留为 fallback 快照，结构与导出不删**（可加注释标注角色转变）
- 现有功能全部保留：懒加载 / IO / 星星视差 / 毛玻璃导航 / 卡片 hover / 樱花滚动条 / 播放器 / 打字机 / 主题 / 收藏 / 搜索

## ⚠️ 坑点预警

1. **verify mock 演进是重点**：先读 verify.mjs 原 fetch mock（91-105 行）与 fetchCalls 断言（216-222 行），按上述方案改，跑通 42/42 再动其它
2. 种子数据必须与 navSources.js **逐字段对齐**（含 icon、coverImg、tag 空值处理）；漏一个字段主站卡片就缺图/缺角标
3. D1 本地验证：`wrangler d1 execute food-nav-db --local --file schema/migrations/001-init.sql`
4. Pages Functions 的 context 结构：`context.env.DB`（D1）、`context.params.id`（[id] 路由）、`context.request`
5. 不新增运行时依赖；wrangler 仅 devDependency
6. PowerShell 写中文文件会损坏 UTF-8 → 源码只用编辑器工具改；SQL 文件同理
7. API 返回字段用 camelCase（coverImg/sortOrder/heatScore），DB 列 snake_case，映射在 SQL 与 navApi 两处对齐
8. 部署（`wrangler pages deploy` / 绑自定义域 `food-nav.shiora.cc`）若无登录态：给出完整命令清单让用户执行，不假装已部署

---

## ✅ 验收与汇报

### 验证命令
```
npm run lint    # 0 警告 0 错误
npm run build   # 通过
npm run verify  # 42 passed / 0 failed（原 40 条语义保留 + 新增 2 条）
npx wrangler d1 execute food-nav-db --local --file schema/migrations/001-init.sql  # 种子入库成功
npx wrangler pages dev dist   # 本地 /api/categories、/api/sites 返回正确 JSON
```

### 手动验证清单（逐项 ✓/✗）
1. `/api/categories` 返回 5 分类（key/name/icon 与 navSources 一致）
2. `/api/sites` 返回 23 站（字段齐全；category=delivery 过滤正确；q=咖啡 模糊命中）
3. `/api/sites/:id` 单站正确；不存在 id → 404 + not_found 信封
4. `/api/health` → db:up
5. 主站：卡片来自 API（Network 面板可见 /api/sites）
6. **断网 / 拔后端**：主站降级本地快照，页面正常渲染、无白屏、无报错刷屏
7. 排序：默认按 sort_order；?sort=heat 按热度（本期无数据也返回）
8. 移动端 375px 无错乱
9. verify 42/42；lint 0/0；build ✓

### 汇报格式
1. 改动清单（新增文件 + 改动的现有文件 + verify 演进 diff 摘要）
2. 验证结果（命令输出 + 清单 9 项逐条）
3. **2 张截图**：正常 API 数据（含 Network 面板证据） / 断网降级快照
4. 部署状态：已部署 / 待用户执行（附命令）
5. 遗留问题与风险
