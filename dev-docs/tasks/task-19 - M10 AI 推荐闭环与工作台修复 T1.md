# task-19 · M10 AI 推荐闭环 + 工作台交互修复 + 页面反馈感 T1

> 生成：2026-10-07 18:40 · 副参谋（用户方向三：AI 工作台 + 首页个性化，已砍凑数项）
> 前置必读：`dev-docs/STATUS.md`、task-12/15/15.1（M5/M8 AI 页）、`src/ask/`（AskPage/AskChat/AskComposer/AskCard/AskWorkspace/askHistory/askCopy/CustomScrollbar）、`src/App.jsx`、`src/styles/ask-theme.css`、`tests/verify.mjs`（52 条）
> 设计原则：**不做凑数功能**；每个改动必须有真实交互增益；不破坏现有 UI/组件风格（贴纸/毛玻璃/樱花粉）。

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\dev-docs\STATUS.md`、本任务文档、`E:\react\food-nav\src\ask\` 全部文件（AskPage.jsx / AskChat.jsx / AskComposer.jsx / AskCard.jsx / AskWorkspace.jsx / askHistory.js / askCopy.js / CustomScrollbar.jsx）、`src\App.jsx`、`src\styles\ask-theme.css`、`src\styles\fade.css`、`tests\verify.mjs`。

任务：**M10 AI 推荐闭环 + 工作台交互修复 + 页面反馈感**，5 个子项：
①**AI 推荐闭环（核心）**：推荐卡片点击 → 在当前会话继续追问该站点（带站点上下文），AI 流式回答；卡片角落保留"打开站点"小按钮（ExternalLink 图标）
②**对话中返回工作台**：对话态可一键返回工作台（保留会话历史，不清空）
③**会话单条删除**：最近会话面板每条可删（确认/补齐 10 条上限）
④**路由切换过渡**：主站 ↔ /ask 切换轻淡入（180ms，复用 food-fade-up 思路，禁全屏 loading）
⑤**点击樱花动效**：全局轻量点击散花（3-5 片，1s 消失，reduced-motion 降级，不拦截默认行为）

硬约束：主站 `src/components/**`、`index.css`、`tailwind.config.js`、`vite.config.js`、`navSources.js` 零改动（仅允许 `src/App.jsx` 路由过渡、`src/ask/`、必要时 `src/styles/` 新增 css）；verify 52 条语义保持（若 AskCard 行为被 verify 断言，需演进为对"打开站点"按钮断言并在汇报说明）；零新运行时依赖。

---

## 📋 任务清单

### 1. AI 推荐闭环（核心，优先级最高）

**现状**：AskCard 整卡 `target=_blank` 直接打开站点——推荐是死链，对话到此结束。

**改为**：
- **卡片主体点击** → 在当前会话追加一条用户消息并触发 AI 回答，消息内容带站点上下文，如：
  `这个站点「${name}」看起来不错，帮我介绍一下它的特色，适合什么样的人用。`
  （消息进对话流、走既有 SSE 流式渲染、可停止、可追问——复用现有发送链路，不新起会话）
- **卡片角落小按钮**（ExternalLink 图标，≥40×40px 触控目标）→ `target=_blank` 打开站点（保留原能力）
- 交互语义：主点击=追问（AI 继续聊），小按钮=打开（直接去网站）
- 实现要点：
  - AskCard 增加 `onAsk(site)` 回调 prop；AskPage/AskChat 传入"发送追问"逻辑（与输入框发送共用同一发送函数）
  - 追问消息与用户手输消息同构（进历史、可被引用）
  - aria-label：卡片 `aria-label="关于${name}继续追问"`、打开按钮 `aria-label="打开${name}站点"`
  - 样式：打开按钮在卡片右上角小圆角图标钮（贴纸风，hover 提升），不破坏卡片整体

### 2. 对话中返回工作台

**现状**：进入对话参与聊天后，只能"清空对话"才能回工作台（用户明确痛点）。

**改为**：
- 对话态 header 左侧新增/调整按钮：**「返回工作台」**（图标 + 文案，SVG 图标风格与现有返回主站按钮一致）
- 语义：返回工作台 = 保留当前会话（**不清空**）→ 会话进「最近会话」面板（可继续上次对话）
- 布局：header 左侧按钮组 = 返回主站 | 返回工作台 | 标题（居中）| 右侧 = 清空对话。移动端不溢出
- 与「清空对话」区分清楚：返回=保留，清空=删除

### 3. 会话单条删除

**现状**：最近会话面板只有"继续上次对话"，无删除。

**改为**：
- `askHistory.js`：确认会话 clamp 10 条（无则补）；新增 `removeSession(id)`（删除单条，800ms debounce 同款）
- AskWorkspace 最近会话面板：每条加删除按钮（× 或 Trash2 图标，aria-label="删除会话"）
- 删除后 localStorage 同步、面板即时更新；删最后一条显示空态引导

### 4. 路由切换过渡

**现状**：主站 ↔ /ask 切换无过渡，硬切。

**改为**：
- `src/App.jsx` 路由容器：切换时应用轻淡入（180ms，复用 food-fade-up 或新增 route-fade，**禁全屏 loading/遮挡**）
- 仅淡入即可（淡出从简），reduced-motion 直接无动画
- 不阻塞渲染（动画不延迟内容显示）

### 5. 点击樱花动效

**现状**：无。

**改为**：
- 全局轻量：`document` click（捕获阶段，**不 preventDefault**，交互元素照常）→ 在点击点生成 3-5 片小樱花花瓣（旋转 + 上飘 + 淡出，~1s，DOM 动画后移除）
- 频率限制：≤ 每 300ms 一次（连点不爆炸）；`prefers-reduced-motion` 直接不触发
- 实现：独立小组件 `src/ask/SakuraBurst.jsx` 或 App 级工具（放在 ask 目录会脱离主站——建议 `src/components/effects/` 新目录，但**不能改现有组件**，只新增组件 + App.jsx 挂载）
  - ⚠️ 注意红线：`src/components/**` 是"零改动"，但**新增**文件在红线语义内是被允许的（此前 MusicPlayer/PageDeco 均如此）；如 App.jsx 挂载点不好加，可挂 HomePage/AskPage 共用层
- 花瓣样式：五瓣樱花 SVG 小片（参考 EmptyTip 樱花），樱花粉，不抢视线

---

## 🚫 禁止
- 主站现有组件/样式文件修改（`src/components/**` 仅允许新增、不允许改现有文件；`src/pages/HomePage.jsx` 不动）
- 全屏 loading / 阻断式过渡；不做右键菜单、留言板、我的常用（已砍）
- verify.mjs 语义破坏（52 条）；若 AskCard 行为断言冲突 → 演进并对齐，汇报中说明
- 不新增运行时依赖；AI 逻辑（SSE/节流/停止/上下文）**逐行不动**，只加"追问入口"复用既有发送链路

## ⚠️ 坑点预警
1. **追问复用发送链路**：不要复制粘贴发送逻辑——AskPage 已有的发送函数抽成可用（AskComposer 与 AskCard 共用同一入口）；SSE 解析/节流/Abort 不动
2. **verify 断言排查**：先 grep verify.mjs 里 `ask` / `AskCard` / `recommend` / `target` 相关断言，确认推荐卡片行为是否被断言（task-12 手动清单有 target=_blank，但 verify.mjs 52 条是否有对应条目需查）；有则演进并注明
3. **返回工作台 vs 清空对话**：状态机区分清楚——返回=保留历史（写入 askHistory），清空=删除；返回后再进对话应能从最近会话恢复（M8 记忆链路）
4. **最近会话删除**：删除时若该会话正在展示（当前对话）→ 不删当前，仅删历史条目（或提示）；避免状态错乱
5. **花瓣动效**：捕获阶段 click 监听注意**不阻止默认**、不触发被动监听警告；移动端 touch 事件（click 合成在移动端可用）；性能：动画元素即时清理，防泄漏
6. **路由过渡**：只在路由切换时触发一次（key 变化），不干扰内部状态切换（分类切换已有 category-fade，别叠加冲突）
7. **PowerShell 写中文文件损坏 UTF-8** → 源码只用编辑器工具改

## ✅ 验收与汇报

### 验证命令
```
npm run lint · npm run build · npm run verify   # verify 52（或按演进后数字，汇报说明）
```

### 手动验证清单（逐项 ✓/✗）
1. AI 推荐闭环：问"推荐烘焙网站"→ 流式回答 → 推荐卡片出现 → **点击卡片主体 → 对话流出现追问消息 + AI 流式回答该站点**（上下文正确）→ 停止/继续正常；点角落打开按钮 → 新标签打开站点
2. 返回工作台：对话中点击 → 回工作台（历史保留）→ 最近会话面板出现该会话 → 继续上次对话恢复
3. 单条删除：删一条 → localStorage 同步、面板更新；删空 → 空态；上限 10 条（超过截断）
4. 路由过渡：主站→/ask、/ask→主站 均有 180ms 淡入、无遮挡、reduced-motion 无动画
5. 樱花动效：点击页面 → 花瓣出现（3-5 片、~1s 消失）；连点不爆炸；点击卡片/按钮功能不受影响；reduced-motion 不触发
6. 回归：主站卡片/懒加载/搜索/收藏/主题/音乐播放器正常；AI 流式/停止/记忆会话/?q= 预填正常
7. 暗色：樱见新交互（追问卡/返回按钮/删除钮）token 正常
8. 375：header 按钮组（返回主站|返回工作台|标题）不溢出；最近会话面板删除按钮可点；花瓣不溢出
9. lint 0/0 · build ✓ · verify 52（或演进后）
10. 移动端：追问卡片/删除按钮触控 ≥40px

### 汇报格式
1. 改动清单（文件级：新增/修改）
2. 验证结果（命令输出 + 清单 10 项逐条）
3. 截图 ≥4 张（dev-docs/reports/task-19/）：01-ask-recommend-ask（点击推荐卡→追问流式）、02-ask-back-workspace（对话中返回工作台+最近会话）、03-ask-history-delete（删除单条）、04-mobile-375（+可选 05-sakura-burst 动效帧、06-dark）
4. 部署状态（默认不部署，附命令）
5. 遗留问题与风险
