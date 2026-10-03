# 食光导航 · 资产梳理与技术方案对比（研讨稿 v0）

> 状态：**待评审**（v0 初稿，评审确认后定稿）
> 生成：2026-10-03 · 副参谋
> 原则：地基优先、严格前后端解耦、主站 UI 零改动

---

## 一、项目资产清单

### 1.1 技术栈（现状）

| 层 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 框架 | React | ^19.2.8 | StrictMode 双跑，需注意 effect 幂等 |
| 构建 | Vite | ^8.3.0 | dev 端口 5174（5173 被占） |
| 样式 | TailwindCSS | ^3.4.19 | darkMode:'class' + CSS 变量 token 体系 |
| 图标 | morphicons + lucide | ^1.7.1 / ^1.48.0 | Morphicon 组件 + lucide IconNode 数据 |
| 语言 | JSX + 少量 TSX | — | TypeWriterQuote.tsx 为 TS |
| 检查 | oxlint | ^1.81.0 | lint 脚本 |
| 测试 | jsdom + node verify.mjs | ^29.1.1 | 40 断言契约，**禁止修改** |
| 路由 | 手写极简路由 | — | hash + pathname 双支持，无路由库 |

### 1.2 前端代码资产（34 个 src 文件）

| 模块 | 文件 | 职责 |
|---|---|---|
| 入口/路由 | main.jsx / App.jsx | 极简路由：`/` → HomePage，其它 → NotFound |
| 页面 | HomePage.jsx / NotFound.jsx | 首页聚合；404 樱花插画页 |
| 布局 | Layout/Header.jsx、Layout/Footer.jsx、Layout/Layout.jsx | 毛玻璃导航（滚动形态）、打字机、主题开关、播放器挂载 |
| 导航卡片 | NavCard/NavCard.jsx、NavGroup.jsx、LazyCard.jsx、CoverPlaceholder.jsx | 卡片（div+覆盖链接+爱心+复制）、懒加载 IO+骨架、封面占位 |
| 分类/搜索 | CategoryTabs.jsx、SearchBar.jsx、EmptyTip.jsx | 分类 Tab、贴纸搜索框、樱花空态 |
| 装饰 | PageDeco.jsx、ThemeToggle.jsx、Toast.jsx | 星星视差+花瓣、主题按钮、toast |
| 打字机 | TypeWriterQuote.tsx | 一言端点链 + 播放歌词双态 + 本地兜底 |
| 播放器 | MusicPlayer/（4 文件） | 歌单分页、播放地址、歌词、失败跳歌、本地兜底、记忆 |
| hooks | useFilterNav / useFavorites / useTheme | 分类记忆+搜索+收藏过滤 / 外部存储 / 主题 |
| utils | storage / clipboard / toast / musicBus | localStorage / 剪贴板 / toast 事件 / 播放器→打字机状态桥 |
| 数据 | data/navSources.js | **23 个站点硬编码**，5 分类 |
| 图标 | icons/registry.js | Morphicons 图标注册表（kebab-case 名称） |
| 样式 | index.css、tailwind.config.js | 双主题 CSS 变量、滚动条、.food-card、token 体系 |

### 1.3 导航数据现状（硬编码核心）

- 数据源：`src/data/navSources.js` → `navSource` 数组（5 分类 23 站：家常菜谱 5 / 烘焙甜点 5 / 外卖到家 4 / 茶饮咖啡 5 / 生鲜食材 4）
- 站点字段：name / desc / url / icon（Morphicons 名称）/ coverImg（本地 SVG）/ tag（可选角标）
- 数据流：`navSource` → `useFilterNav`（分类记忆 + 模糊搜索 + 收藏过滤）→ `NavGroup` → `NavCard` 渲染
- ⚠️ 收藏匹配基于 **item.name**（localStorage `food-nav:favorites` 存名称数组）——后端化后名称可编辑会造成收藏失联，需迁移方案

### 1.4 第三方 API 依赖（全部公共公益 API）

| API | 用途 | 稳定性现状 |
|---|---|---|
| `v1.hitokoto.cn/?c=a` | 打字机一言 | CORS 友好；偶发慢 |
| `quote.shiora.cc/api/hitokoto?type=a` | 自身接口（已弃用） | 无 CORS 头，浏览器读不到 |
| `node.api.xfabe.com/api/wangyi/userSongs?uid=18441576713&limit=` | 歌单 | 返回不稳定（4~22 首），limit≥25 封顶 22 |
| `node.api.xfabe.com/api/wangyi/music?type=json&id=` | 播放地址 | 偶发全体 400「此歌曲为空」 |
| `node.api.xfabe.com/api/wangyi/lyrics?id=` | 歌词 | 覆盖不全（部分歌空 lyric/超时） |

### 1.5 交互逻辑清单（后端化时不得破坏）

| 交互 | 机制 | 存储 |
|---|---|---|
| 分类 Tab 切换记忆 | normalizeCategory 校验 | `food-nav:category` |
| 模糊搜索 | name+desc 实时过滤 | — |
| 收藏/取消 | 外部存储 hook | `food-nav:favorites`（按 name） |
| 复制链接 | clipboard + toast | — |
| 卡片懒加载 | IO rootMargin 240px + 骨架 | — |
| 主题切换 | CSS 变量 + 防 FOUC 前置脚本 | `food-nav:theme` |
| 打字机 | 端点链：VITE_QUOTE_PROXY → dev 代理 → 直连 → 一言 → 本地 6 句 | — |
| 播放器 | 分页加载/失败跳歌/兜底/记忆 | `food-nav:music` / `food-nav:volume` |

### 1.6 视觉规范（后端化红线）

- 双主题：CSS 变量 `:root`（樱花粉）/ `html.dark`（紫黑）驱动 `food-*` token 与 `shadow-*`
- 贴纸风：硬偏移阴影、`border-2`、圆角 `rounded-3xl`/`9999px`、半透白毛玻璃
- 动画红线：卡片 hover `rotate(-3deg) scale(1.02)`、樱花粉滚动条（8px/999/track #FEF2F7/thumb #FFB6CD）、星星视差、花瓣飘落
- `prefers-reduced-motion` 降级动画；`html{overflow-y:scroll}` 防抖动

---

## 二、技术方案对比

### 2.1 候选方案总览

| 维度 | A. Cloudflare Pages+Workers+D1（首选） | B. Vercel+Neon/Postgres | C. Supabase | D. 自托管 VPS | E. 纯前端+BaaS |
|---|---|---|---|---|---|
| **架构** | 前端 Pages 静态；API Workers/Pages Functions；数据 D1(SQLite) | 前端 Vercel；API Serverless；数据 Neon | 前端 Vercel/任意；API+Auth+DB 全托管 | Node+Express+SQLite/Postgres | 前端 + JSONBin/GitHub/Notion |
| **月成本** | **0 元**（免费额度：Pages 无限、Workers 10 万请求/天、D1 5GB/500 万行读） | 0~20 美元（Neon 免费额度有限） | 0 元（500MB DB 免费档） | 30~100 元 + 域名备案 | 0 元 |
| **同源免 CORS** | ✅ Pages Functions 挂 `/api` 同源；自定义域同源 | ✅ Vercel API Routes 同源 | ⚠️ 需配 CORS | ✅ 同源 | ✅ 但无后端 |
| **定时任务** | ✅ Cron Triggers（免费限 2 个） | ⚠️ Hobby 计划 cron 受限 | ✅ Edge Functions cron | ✅ 系统 cron | ❌ |
| **链接检测** | ✅ Worker fetch + 超时 + 重试 | ✅ Serverless + cron | ✅ | ✅ 最灵活 | ❌ |
| **管理员鉴权** | 简易 token / Cloudflare Access | 简易 token | ✅ 内置 Auth（最大优势） | 自研 | ❌ |
| **数据备份** | D1 export → R2（脚本化） | Neon 自动备份（付费档） | ✅ 自动备份 | 自管 | ❌ |
| **维护难度** | 低（无服务器，Git 集成 CI/CD） | 低 | 低 | **高**（安全更新/进程/备份） | 极低但脆弱 |
| **国内访问** | ⚠️ **直连不稳，需自定义域名+优选 IP** | ⚠️ 一般 | ⚠️ 一般（域被墙风险） | ✅（备案后） | 依赖服务商 |
| **锁定程度** | 中（SQL 可迁移、API 简单） | 中 | 高 | 低 | 高 |
| **学习价值（对你）** | 高（边缘计算/SQL/CI） | 高 | 中（被封装太多） | **最高**（全栈运维） | 低 |
| **结论** | ✅ **推荐** | 备选（想要真 Postgres） | 备选（想要开箱 Auth） | 备选（长期重度/要掌控） | ❌ 不推荐 |

### 2.2 推荐结论

**首选 A：Cloudflare Pages + Pages Functions(Worker) + D1**
- 免费额度对个人项目完全够用；Pages 静态托管与 API **同源部署**（自定义域下 `/api/*` 与前端同域）→ **跨域问题从根上消失**
- Cron Triggers 承担链接存活检测；D1 是 SQLite（SQL 技能可复用，未来可迁 Postgres）
- 已知短板：国内直连不稳 → 需自定义域名 + 优选 IP 方案（或接受个人使用场景）
- 备选切换路径：A 的 API 是标准 REST + SQL，若未来需求升级可平移 B/C 而不动前端

### 2.3 待决策问题（影响选型与范围）

1. 部署目标：接受 Cloudflare 免费栈（国内直连不稳，配自定义域名优化）？还是考虑国内云（需备案+月费）？
2. 数据范围：仅导航卡片+分类后端化（收藏/主题留 localStorage）？还是全部后端化（含收藏同步，需登录体系）？
3. 管理员面板形态：同仓库独立模块（`src/admin/` + 独立路由懒加载，共享设计 token 零逻辑耦合）？还是完全独立应用？
4. 自有域名：是否有可用自定义域名？（影响同源部署与国内访问方案）
