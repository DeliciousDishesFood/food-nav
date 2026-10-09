# task-12 · M5 AI 智能问答 + 分类过渡动画 + M4 部署 T1

> 生成：2026-10-05 · 副参谋（已评审定稿）
> 前置必读：`dev-docs/STATUS.md`、`dev-docs/architecture/02-backend-design.md`、`03-m1-backend-detail.md`、task-11（M4 现状，本任务第 0 步先部署）
> 前置状态：M1-M4 完成（47/47）；M4 仅本地验证未部署

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\dev-docs\STATUS.md`、`E:\react\food-nav\dev-docs\architecture\02-backend-design.md`、`03-m1-backend-detail.md`、本任务文档、`E:\react\food-nav\functions\_middleware.js`、`functions\api\_lib\track.js`、`_lib\response.js`、`_lib\auth.js`、`_lib\db.js`、`functions\api\sites.js`、`src\App.jsx`、`src\pages\HomePage.jsx`、`src\admin\AdminShell.jsx`、`src\admin\AdminApi.js`、`tests\verify.mjs`。

任务：**M5 三合一**——① 第 0 步：**M4 线上部署**（migration 004 远程 + Pages deploy + **cron Worker 重部署** + middleware 回归验证）② **AI 智能问答**（/ask 子页面 + GLM 代理 + Function Calling 检索站内站点 + SSE 流式 + 推荐卡片，独立 src/ask/ 模块懒加载）③ **分类切换过渡动画**（HomePage 容器 key 触发 fade-up，新建 src/styles/fade.css，避开 index.css 红线）。

硬约束：主站 `src/components/**` 零改动（推荐卡片在 src/ask/ 内**新建** AskCard，禁 import 主站组件；AI 入口放 HomePage 可改区域）；`navSources.js`/`index.css`/`tailwind.config.js`/`vite.config.js` 不动；verify 47 条语义全保留 + **新增 2 条 → 49**；运行时依赖不新增；**GLM_API_KEY 只在启动提示词（对话）中提供，禁止写入任务卡/任何将提交的文件**。

完成后按本文「✅ 验收与汇报」逐项验证并汇报（含 3 张截图）。

---

## ⚠️ 第 0 步：M4 线上部署（前置，先做）

```
npx wrangler d1 execute food-nav-db --remote --file schema/migrations/004-visits.sql   # 迁移 004（幂等）
npm run build && npx wrangler pages deploy dist --project-name food-nav                # Pages（含 middleware + track/stats API）
npx wrangler deploy --config cron/wrangler.toml                                        # cron 重部署（checker UA/分级已改，必须）
npx wrangler triggers status --config cron/wrangler.toml                               # 确认 cron 注册
```
**middleware 回归验证（全局高风险变更，部署后立即）**：首页 200 且正常渲染 → `/api/health` → `/admin` 可达 → 刷新一次页面确认 Set-Cookie fv_id 生效（DevTools/curl -I 看响应头）。异常回滚 = 删除 `functions/_middleware.js` 重新 build deploy。

---

## 📋 任务清单

### 1. GLM 问答代理（后端）

**functions/api/ai/chat.js**（新增，POST）：
- **鉴权不要求登录**（主站访客可用），但必须**限流**：复用 `overTrackLimit(db, ip, 'ai')`（track_limits，IP 分钟桶 **≤10**，超限 429 `{code:'rate_limited'}`）
- 请求体：`{ messages: [{role, content}], history?: [...] }`（messages 为当前会话消息数组，最长 10 条、单条 ≤2000 字，服务端 clamp）
- **env：GLM_API_KEY**（生产 `wrangler pages secret put GLM_API_KEY`；本地 `functions/.dev.vars` 同步——值见启动提示词）
- 调 GLM（OpenAI 兼容）：`POST https://open.bigmodel.cn/api/paas/v4/chat/completions`
  - `Authorization: Bearer <GLM_API_KEY>`；`model` 以**实测确认**为准（启动提示词给的是 glm-v4.7-flash，若 400 换 glm-4.7-flash / glm-4-flash，把可用模型名写进汇报）
  - `stream: true`、`tools: [{type:'function', function:{name:'search_food_sites', description:'检索站内收录的美食网站/站点，用于向用户做推荐', parameters:{type:'object', properties:{query:{type:'string',description:'搜索关键词'}, category:{type:'string',description:'分类 key（可选）'}}, required:['query']}}}]`
- **tool 执行器**（服务端）：`search_food_sites(query, category?)` → D1 查 `sites`（status='active'）按 `name LIKE '%q%' OR desc LIKE '%q%' OR tag LIKE '%q%'`（category 可选加 `category_id` 过滤）→ `LIMIT 6` → 返回 `[{id,name,desc,url,icon,coverImg,categoryKey}]`；**无结果返回空数组**（模型应如实说没收录）
- **两段式流式**：
  1. 第一段流：转发 GLM 响应，解析 SSE；若中间出现 `tool_calls` → **缓冲**（不转发给前端），流结束后执行 tool → 组装 tool 结果消息 → 第二次请求 GLM（带历史 + tool 结果，stream:true）→ 转发第二段流
  2. 若第一段无 tool_calls → 直接转发完整流
- **SSE 透传**：Workers 用 `ReadableStream` + `TransformStream` 透传（`new Response(readable, {headers:{'content-type':'text/event-stream', 'cache-control':'no-cache'}})`）；GLM 事件 `data: {...}\n\n`，content delta 在 `choices[0].delta.content`；`data: [DONE]` 结束
- **推荐数据回传**：流结束前发一个**自定义 SSE 事件**：
  ```
  event: recommend
  data: {"sites":[{"id":..,"name":..,"desc":..,"url":..,"icon":..,"coverImg":..,"categoryKey":..}]}
  ```
  （tool 执行结果去重，≤6 条；无 tool 调用则不发）
- 错误处理：GLM 4xx/5xx → 透传错误信封；上游超时 30s → 503；**所有错误不把 key 泄露给前端**

### 2. 前端 /ask 独立模块（src/ask/，懒加载）

```
src/ask/
├── AskPage.jsx       # 容器：标题 + 聊天区 + 输入区；从 query 参数?q= 预填首问（可选）
├── AskChat.jsx       # 消息列表 + 流式渲染 + 发送/停止 + 会话上下文（最多 10 条）
├── AskComposer.jsx   # 输入框（Enter 发送 / Shift+Enter 换行）+ 发送按钮；发送中禁用并显示「停止」
└── AskCard.jsx       # 推荐卡片（贴纸风 token：bg-food-surface/border-food-line/shadow-foodSticker/圆角；name+icon+desc+「去看看 →」新开链接；**独立实现，禁 import 主站组件**）
```
- 路由：App.jsx 加 `/ask`（第三个懒加载 + Suspense，复用 AdminFallback 或新建轻量 fallback）
- 流式渲染：fetch `/api/ai/chat`（POST，stream:true）→ `response.body.getReader()` + TextDecoder 解析 SSE → **累积缓冲 + 50ms 节流 setState**（防每 token 一渲染卡顿）；解析 `event: recommend` 存推荐数据 → 回复结束后在消息底部渲染「✨ 相关推荐」卡片组
- 消息气泡：用户右对齐（food-primary 底/白字），AI 左对齐（surface/描边）；贴纸风（圆角 2xl + 硬阴影 + 细边框）
- 会话上下文：`messages` 数组本地 state（仅当前会话，不持久化）；「清空对话」按钮可选
- **入口**：HomePage 可改区域加贴纸风按钮「✨ 问问美食 AI」→ `window.location.hash = '#/ask'`（保持 hash 路由习惯）；放哪由你定（搜索框附近/hero 区），保持风格一致
- 移动端：输入区固定底部（safe-area），聊天区自适应高度；375px 不溢出

### 3. 分类切换过渡动画（HomePage，零组件改动）

- 新建 `src/styles/fade.css`（**index.css 红线禁改，用新文件**）：
  ```css
  @keyframes food-fade-up {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .category-fade { animation: food-fade-up .18s ease both; }
  ```
- HomePage：分组渲染容器（NavGroup 外层 div）加 `key={activeCategoryKey}` + `className="category-fade"`——**仅分类切换触发**（搜索过滤不换 key，避免打字闪烁）；180ms 轻量淡入上移，不破坏现有视觉
- HomePage 顶部 import `../styles/fade.css`

### 4. verify.mjs 演进（47 → 49）

- mock：`/api/ai/chat` 路由（apiMode ok → SSE 模拟：`data: {"choices":[{"delta":{"content":"你好"}}]}\n\nevent: recommend\ndata: {"sites":[]}\n\ndata: [DONE]`；fail → 429）
- 新增 2 条：① 导航到 `#/ask` → AI 页面渲染（出现输入框）② HomePage 出现「问问美食 AI」入口按钮
- 原 47 条语义全保留

---

## 🚫 禁止改动

- `src/components/**`（AI 推荐卡片在 src/ask/ 新建 AskCard；HomePage 仅加入口按钮 + 容器 key/class）
- `navSources.js` / `index.css` / `tailwind.config.js` / `vite.config.js` / `package.json`
- verify.mjs 原 47 条断言语义
- 现有功能全部保留（含 M4 middleware/track/UV 统计）

## ⚠️ 坑点预警

1. **GLM 模型名需实测**：glm-v4.7-flash / glm-4.7-flash / glm-4-flash 三选一，400 就换，可用模型写进汇报
2. **apikey 纪律**：只出现在启动提示词；生产 `wrangler pages secret put GLM_API_KEY`；本地 `.dev.vars` 同步；**禁止写入任务卡/代码注释/任何将提交文件**
3. **SSE 透传**：Workers 用 TransformStream 逐块转发（勿缓冲整个响应）；响应头 `text/event-stream` + `no-cache`
4. **tool_calls 缓冲**：第一段流中间可能出现 tool_calls delta，**不能边收边转发**（会打乱顺序）；收完再执行第二段
5. **前端流式节流**：50ms 或 200 字符 flush 一次 setState；`[DONE]` 结束；AbortController 支持「停止」
6. **GLM 免费模型限流**：实测 RPM/TPM；服务端限频 ≤10/分钟/IP 兜底
7. **推荐卡片**：AskCard 独立实现（复制视觉不复制代码）；禁 import NavCard/LazyCard 等主站组件
8. **历史消息长度**：服务端 clamp 10 条/单条 2000 字，防上下文超限
9. **fade.css**：普通 CSS 直接 import（Vite 支持多 CSS），不依赖 tailwind 配置；**class 命名带 food- 前缀防冲突**
10. **M4 部署是前置**：middleware 回归必做；cron 必须重部署（checker 改了）
11. verify：/ask 懒加载断言需 await（动态 import）；mock 的 SSE 要完整（含 [DONE]）
12. PowerShell 写中文文件损坏 UTF-8 → 源码只用编辑器工具改

## ✅ 验收与汇报

### 验证命令
```
npm run lint · npm run build · npm run verify   # verify 49/49，原 47 全绿
npx wrangler d1 execute food-nav-db --remote --file schema/migrations/004-visits.sql  # 第 0 步（幂等）
npx wrangler pages dev dist --port 8788         # 本地 API（含 AI）
```

### 手动验证清单（逐项 ✓/✗）
1. **M4 部署回归**：首页 200 + fv_id cookie 生效 + /api/health + /admin 可达 + cron triggers 确认
2. **AI 问答**：问「有什么烘焙甜点网站推荐？」→ 流式输出 + 结束渲染「相关推荐」卡片组（来自 tool 检索）
3. **tool calling**：问「帮我找咖啡类网站」→ 服务端日志显示 search_food_sites 调用且返回分类匹配站点；问「解释一下什么是舒芙蕾」→ 无 tool 调用纯知识回答（无推荐卡片，正常）
4. **流式**：逐字/逐块渲染（非一次性）；「停止」可中断；历史上下文 10 条内有效（追问「第一个的网址是什么」能引用上文）
5. **限流**：同 IP 高频请求 AI → 429；被限不破坏主站
6. **apikey 不泄露**：浏览器 Network 里请求只发到 /api/ai/chat（无 bigmodel.cn 直连）；服务端错误响应不含 key
7. **分类过渡**：切换分类 → 卡片组轻量淡入上移（~180ms）；搜索过滤不触发动画
8. **/ask 与 #/ask** 均可达；HomePage 入口按钮跳转正常；懒加载 chunk 生效（首页无 AI 代码）
9. **推荐卡片**：点击新开链接；贴纸风视觉一致；375px 不溢出；最多 6 张
10. verify 49/49 · lint 0/0 · build ✓；M4 全功能（UV/热度/打标）回归正常
11. 移动端：AI 页面输入区固定底部无遮挡；消息气泡无溢出

### 汇报格式
1. 改动清单（新增/修改文件 + verify diff + **GLM 实测模型名**）
2. 验证结果（命令输出 + 清单 11 项逐条 + tool calling 实测对话记录 1-2 条）
3. **3 张截图**：AI 问答页（流式回答中或完成后 + 推荐卡片）/ 分类过渡（切换瞬间或对比）/ 移动端 375
4. 部署状态：M4 部署完成情况 + M5 是否部署；未部署给出命令
5. 遗留问题与风险（含 GLM 免费模型限额/响应时长实测）
