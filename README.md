# 食光导航 · 美食灵感整理站 🌸

樱花粉动漫贴纸风的**美食导航站**：聚合家常菜谱、烘焙甜点、外卖到家、茶饮咖啡、生鲜食材五类好站，收藏那些让人心动的味道。

## ✨ 功能特性

- **分类导航**：全部 / 我的收藏 / 家常菜谱 / 烘焙甜点 / 外卖到家 / 茶饮咖啡 / 生鲜食材，选中分类刷新后自动记忆
- **本地模糊搜索**：按标题 + 描述实时过滤，无结果时显示樱花空态插画
- **卡片收藏**：点击卡片右上角爱心收藏，数据存 localStorage，可在「我的收藏」分类集中查看
- **hover 复制链接**：悬停卡片右下角一键复制站点链接，带 toast 反馈
- **打字机暖心句子**：顶部一言逐字打印（70ms/字、停留 20s），3s 超时 + 6 句本地兜底，永不白屏
- **食光电台**：右下角悬浮音乐播放器，网易云收藏歌单（分页加载更多），播放时打字机自动切换为滚动歌词，无歌词自动回一言；接口失败自动跳歌 + 本地 6 首兜底
- **双主题**：樱花粉亮色 / 暗系紫黑贴纸风，右上角一键切换；首次访问跟随系统偏好，选择后记住
- **懒加载**：卡片进入视口 ±240px 才渲染真实内容，首屏显示等高骨架，无布局跳动
- **动效细节**：飘落樱花、闪烁星星弱视差（滚动零重渲染）、毛玻璃导航栏、卡片 hover 形变（rotate(-3deg) scale(1.02)）、樱花粉滚动条
- **404 页面**：樱花插画 + 暖心文案 + 返回首页
- **后端数据**：站点/分类托管 Cloudflare D1，前端首帧快照 → 接口刷新 → 失败降级快照，永不白屏
- **AI 问答「樱见」**：GLM 流式回答 + 站内 tool-calling，回复末尾自动推荐相关站点卡片，点击可继续追问；工作台 + 记忆会话（10 条可单删）
- **管理面板**：独立 `/admin` 路由，站点/分类 CRUD、三模式封面、热度榜、访问统计、链接检测中心、打标（热门/新品/推荐）
- **链接存活检测**：cron 每日自动检测 + 手动检测，分级判定（反爬 403 不再误杀），broken 自动隐藏
- **访问统计**：匿名 UV 去重（fv_id cookie）+ 收藏/点击热度上报，热度榜实时可见

## 🛠 技术栈

- React 19 + Vite 8 + JavaScript(JSX) + 少量 TypeScript(打字机组件)
- TailwindCSS 3.4（`darkMode: 'class'` + CSS 变量双主题）
- morphicons（lucide 图标数据）+ 自绘 SVG 插画
- Cloudflare Pages Functions + D1（SQLite）+ 独立 cron Worker 定时检测
- GLM 大模型（SSE 流式 + tool-calling，API key 存 Pages secret）
- oxlint 代码检查 · jsdom 端到端验证脚本

## 🚀 本地开发

```bash
npm install
npm run dev      # 启动开发服务器（含 /quote-api 同源代理）
```

## ✅ 质量验证

```bash
npm run lint     # oxlint，0 警告 0 错误
npm run build    # 生产构建
npm run verify   # jsdom 验证：懒加载 / 打字机 / 接口 / 主题 / 收藏 / 搜索 / 分类记忆 / 复制 / 404 / API / AI 入口，52 项断言
```

## ☁️ 部署架构

生产环境部署在 **Cloudflare**，自定义域 `https://food-nav.shiora.cc`：

```
浏览器 ── food-nav.shiora.cc (Pages)
         ├── dist/ 静态前端（React 构建产物）
         ├── functions/ Pages Functions API（信封响应 {ok,data} / {ok:false,error}）
         │     ├── /api/categories · /api/sites · /api/sites/[id]   站点/分类 CRUD
         │     ├── /api/admin/*   管理员登录（HMAC + 限频锁定）
         │     ├── /api/ai/chat   GLM 代理（SSE 流式 + tool-calling + 限流）
         │     ├── /api/favorites 收藏服务端化（轻签名 + 限频）
         │     ├── /api/check/*   链接检测（手动触发 / 日志）
         │     ├── /api/stats/visits · /api/track/*   UV / 点击 / 收藏热度
         │     └── _middleware.js 页面 UV 统计中间件（fv_id cookie）
         ├── D1 food-nav-db（SQLite）   schema/migrations/001~007
         └── cron/ 独立定时 Worker      crons="0 4 * * *" 每日链接检测
```

生产环境变量（Pages secrets / 本地 .dev.vars，均已 .gitignore，不入库）：
`ADMIN_PASSWORD` · `ADMIN_SECRET` · `GLM_API_KEY` · `FAVORITE_SALT`（与前端 useFavorites.js 常量同值）

部署命令见 `dev-docs/tasks/task-17`（迁移 → secrets → build → pages deploy → cron deploy）。

## 🌐 一言接口说明（重要）

顶部句子来自 `https://quote.shiora.cc/api/hitokoto?type=a`（动漫分类）。该源站**不返回 CORS 头**，浏览器直连会 200 OK 却读不到数据。端点选择链：

1. **`VITE_QUOTE_PROXY`**（生产首选）：部署 `worker/` 目录的 Cloudflare Worker 代理后，将地址写入 `.env` 并重新构建
2. **开发环境**：自动走 Vite 同源代理 `/quote-api`（`vite.config.js` 已配置）
3. **直连**：无代理配置时尝试直连
4. **本地兜底**：以上全部失败时使用内置 6 句动漫风句子，不会白屏

### 部署 Cloudflare Worker 代理

```bash
cd worker
npx wrangler deploy
# 拿到 https://<your-worker>.workers.dev 后：
cp ../.env.example ../.env   # 填上 VITE_QUOTE_PROXY
npm run build
```

## 🎨 主题与本地存储

| Key | 用途 |
| --- | --- |
| `food-nav:theme` | 主题记忆（`light` / `dark`） |
| `food-nav:category` | 分类标签记忆 |
| `food-nav:favorites` | 收藏站点名列表 |
| `food-nav:music` | 播放器记忆（歌曲 id / 播放状态 / 进度） |
| `food-nav:volume` | 音量记忆（音量 / 静音） |

所有存储读写均有隐私模式 / 配额异常静默降级，不抛错。

## 📚 项目文档

| 文档 | 内容 |
| --- | --- |
| `dev-docs/architecture/01-assets-and-stack.md` | 项目资产梳理 + 技术方案对比（研讨稿） |
| `dev-docs/architecture/02-backend-design.md` | 后端设计稿：数据库 / 接口 / 管理面板 / 链接检测 / 路线图 |
| `dev-docs/tasks/` | 分阶段开发任务文档（T1 系列） |

## 📁 目录结构

```
src/
├── components/        # UI 组件（Header/卡片/懒加载/装饰/Toast…）
│   ├── Layout/        # 布局（毛玻璃导航 / Footer / 播放器挂载）
│   ├── MusicPlayer/   # 食光电台（状态机 / 接口封装 / 本地兜底）
│   ├── NavCard/       # 导航卡片 / 分组 / 懒加载（封面破图兜底）
│   └── effects/       # 点击樱花动效
├── admin/             # 管理面板（登录/站点/分类/检测/统计/热度榜/图标选择器）
├── ask/               # AI 樱见（工作台/对话/推荐卡片/记忆会话/自定义滚动条）
├── api/navApi.js      # 导航数据获取（首帧快照 → D1 接口 → 降级）
├── data/navSources.js # 本地快照数据源（接口不可用时的降级 + 种子参考）
├── hooks/             # useFilterNav / useFavorites（服务端同步）/ useTheme
├── icons/registry.js  # lucide 图标名 → MorphIcon 数据映射
├── pages/             # HomePage / NotFound
├── styles/            # 主题变量 / 淡入 / 樱花动效 / AI 页样式
├── utils/             # storage / clipboard / toast / musicBus
functions/             # Cloudflare Pages Functions API（api/ + _lib/ + _middleware.js）
schema/migrations/     # D1 迁移（001~007）
cron/                  # 独立定时检测 Worker
public/covers/         # 樱花粉封面插画（SVG）
tests/verify.mjs       # jsdom 验证脚本（52 断言契约，禁改）
worker/                # Cloudflare Worker 一言 CORS 代理
dev-docs/              # 任务文档 + 架构研讨 + 验收报告（截图不入库）
```

## 📄 License

MIT
