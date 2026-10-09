# task-14 · M7 AI 问答页布局打磨 T1

> 生成：2026-10-06 16:40 · 副参谋（已评审定稿）
> 前置必读：`dev-docs/STATUS.md`、task-13（M6 现状）、`src/ask/AskPage.jsx`、`AskChat.jsx`、`AskComposer.jsx`、`CustomScrollbar.jsx`、`src/styles/ask-theme.css`
> 前置状态：M1-M6 完成，verify 50/50；本任务**只调布局/间距/层级**，配色与 `.ask-bubble-me` 原样保留

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\dev-docs\STATUS.md`、本任务文档、`E:\react\food-nav\src\ask\AskPage.jsx`、`AskChat.jsx`、`AskComposer.jsx`、`CustomScrollbar.jsx`、`src\styles\ask-theme.css`、`tests\verify.mjs`。

任务：**M7 AI 问答页布局打磨**——只调 5 处布局/间距/层级，解决用户反馈：①导航栏布局奇怪 ②对话滚动条贴近对话内容 ③main 空态引导区不紧凑 ④右侧 aside 排版问题 ⑤底部输入条白色突兀不合群。**配色方案与 `.ask-bubble-me`（樱花渐变白字）样式禁止改动**；交互逻辑（SSE/停止/推荐/chips/发送）一行不动。

硬约束：主站 `src/components/**`、`navSources.js`、`index.css`、`tailwind.config.js`、`vite.config.js` 零改动；新样式收敛在 `src/styles/ask-theme.css`；verify 50 条语义全保留（**不新增断言**，本任务纯视觉）；零新依赖。

完成后按本文「✅ 验收与汇报」逐项验证并汇报（含 3 张截图：新 header+双栏整体 / 输入条融入页面+滚动条间距 / 375 移动端）。

---

## 📋 任务清单

### 1. 导航栏（AskPage.jsx:308-332）—— 改为悬浮圆角毛玻璃条，与主站导航呼应

现：通栏 `border-b bg-white/60` 直边条，`justify-between` 左右硬挤。
改：
- 通栏容器改透明（`bg-transparent border-b-0`），内部 header 主体改为**悬浮胶囊**：`mx-auto mt-3 w-full max-w-6xl rounded-[20px] border border-white/85 bg-white/70 px-4 py-2.5 backdrop-blur-md`（暗色 `dark:border-white/10 dark:bg-[#241A33]/75`，可参考主站 Header 毛玻璃配方）
- 内部布局：左 = 品牌组（`← 回到主站` 按钮 + 竖向分隔线 `h-5 w-px bg-food-line/60` + `✨ 食光 AI 问答` 标题，`items-center gap-3`）；右 = `清空对话` 按钮；`justify-between`
- 按钮统一下沉成小号胶囊（`px-3.5 py-1.5 text-xs/control`），与悬浮条协调；hover 保留 `-translate-y-0.5`
- 标题字号可微降（`text-card-title` → 保持或 `text-lg`），让导航整体更紧凑

### 2. 滚动条与内容间距（CustomScrollbar.jsx:111 + AskChat.jsx:217）

- CustomScrollbar thumb：`right-1` → `right-1.5`（6px），宽度 `w-[3px]` 保持
- 消息容器（AskChat.jsx:217 `space-y-5 px-1 py-4`）：`px-1` → **`px-3`**（内容与右侧滚动条留出 ≥12px 视觉间距）；`space-y-5` → `space-y-4`（气泡间距稍紧凑）
- 空态容器（AskChat.jsx:183 `px-2 py-8`）同步 `px-3`
- 目的：滚动条不再"贴脸"气泡，长消息也撑得住

### 3. main 空态引导区紧凑化（AskChat.jsx:182-212）

现：插画(h-28 w-44) → 标题 → 问候 → chips → 换一批按钮垂直堆叠，面板 `px-6 py-10`，松散。
改（**结构允许调整，交互语义保留**）：
- 面板 padding 收窄：`px-6 py-10` → `px-5 py-7`
- 插画微缩：`h-28 w-44` → `h-24 w-36`，与标题间距收紧（`mt-4` → `mt-3`）
- 标题 + 问候合并为一块（`mt-4` 标题、`mt-2` 问候保持，但整体上移更紧凑）
- chips 区 `mt-5` → `mt-4`，chips 间距 `gap-2` 保持
- `换一批灵感` 按钮 `mt-4` → `mt-3`，字号 text-xs 保持
- 空态面板 max-w：`max-w-xl` → `max-w-lg`（更聚焦）
- 有消息时的气泡行距、推荐卡片面板（AskChat.jsx:119 `p-3.5`）可微调 `p-3`，保持视觉密度统一

### 4. 右侧 aside 紧凑统一（AskPage.jsx:93-170）

现：三个面板各自 `p-4 rounded-[22px]`、`gap-4` 叠放，品牌面板只有两行字占大块。
改：
- 面板统一：padding `p-4` → **`p-3.5`**，面板间 `gap-4` → **`gap-3`**，圆角统一 `rounded-[22px]`
- 品牌面板精简：描述文案可保留但字号/行距收紧（`mt-1.5` → `mt-1`）；或在品牌面板加一行小状态（如"在线 · 美食专属模型"装饰性文案，禁真实状态接口）——**可选，不做也行**
- 灵感面板：`mb-2.5` → `mb-2`；chips `gap-2` → `gap-1.5`（更密）；chip `px-3 py-1.5` → `px-2.5 py-1`
- 今日美味面板：列表项 `py-2` → `py-1.5`；`gap-1` → `gap-0.5`；底部提示 `mt-2.5` → `mt-2`、可改 `text-[11px]`；emoji 方块 `h-8 w-8` 保持
- 侧栏宽度 `w-72` 保持；`hidden lg:flex` 保持

### 5. 底部输入条融入页面（AskComposer.jsx:64-99）

现：通栏 `border-t border-white/80 bg-white/70` 白色横带，与页面底部淡紫蓝渐变断层。
改：
- 底部容器：去掉白色通栏 → **`bg-transparent border-t-0`**（完全融入页面渐变）；若怕内容滚动穿帮，可加极淡上渐晕（`bg-gradient-to-t from-white/60 to-transparent` 仅 24px 高，暗色 `from-[#1d1530]/60`）——**二选一，推荐无通栏 + 悬浮输入条方案**
- 输入条本体改为**悬浮胶囊**：`ask-panel ask-soft rounded-[28px]` + 高度统一 `min-h-[52px] py-2.5`（比现 46px 略高更从容）；textarea `px-5 py-2.5`、max-h 150 封顶不变；placeholder 行为/轮换逻辑不动
- 发送按钮：嵌入输入条右端（`ml-2` 内联，`h-[40px] w-[40px]` 或保持 46 方形微调），`ask-send` 渐变保留；「停止」按钮同尺寸化
- 布局行：`items-end gap-3 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3` → `pt-2`（顶距收窄）；max-w-6xl 保持
- 目的：输入条像"浮在页面上的一颗胶囊"而非"横贯的白色胶带"

---

## 🚫 禁止改动

- 配色方案（暖纸渐变、樱花光斑、气泡色、chips 色、ask-send 渐变）**全部原样**
- `.ask-bubble-me`（樱花渐变/白字/圆角/阴影）**一行不动**
- SSE 解析、节流、Abort、停止、推荐机制、chips 点击语义、?q= 预填、回主页逻辑
- CustomScrollbar 的滚动手势/拖拽/重算逻辑（只改 thumb 的 right 位置类）
- 主站任何文件；verify.mjs 一条断言不动（本任务不新增）
- 运行时依赖不新增

## ⚠️ 坑点预警

1. **verify 50 语义必须全绿**：ask 相关断言（懒加载渲染输入框按 `aria-label="提问输入框"` 查找、chips 存在、推荐卡片渲染、429 信封）**靠 DOM 语义定位**——textarea 的 aria-label、button 文案（发送/停止/清空对话/换一批灵感）不能改字面；只改 className/容器结构
2. **header 悬浮胶囊**：`mt-3` 悬浮后，页面滚动时顶部背景会透出——确认胶囊内文字对比度（浅色下白玻璃 + 深字 OK）；移动端胶囊宽度 `mx-3`（或 max-w-6xl 内 mx-auto + px 自适应），375 下按钮+标题不溢出
3. **输入条悬浮方案**：发送/停止按钮必须保持 ≥44×44 可点区域（现 46 方形 OK，改 40 会破可访问性——**保持 46 或 h-[44px] 以上**）；textarea `min-h` 与按钮 `h` 对齐（items-end 下按钮底对齐）
4. **空态结构**：`换一批灵感` 按钮与 chips 点击后"换一批+提问"语义保留（handleChip）；空态面板改 max-w-lg 后 375 不溢出
5. **aside 移动端**：`hidden lg:flex` 保持——375 单栏时侧栏完全隐藏，验收时确认主聊天区全宽
6. **thumb 间距**：内容 px-3 + thumb right-1.5 后，长消息/长 URL 在 375 下仍 `overflow-wrap:anywhere` 不断行溢出（M6 已修，勿回退）
7. **fade/enter 动效**：`.ask-enter`/`.ask-card-enter` 保留；reduced-motion 降级块不动
8. **PowerShell 写中文文件损坏 UTF-8** → 源码只用编辑器工具改

## ✅ 验收与汇报

### 验证命令
```
npm run lint · npm run build · npm run verify   # verify 50/50 原语义全绿（不新增）
npx wrangler pages dev dist --port 8788         # 本地联调截图
```

### 手动验证清单（逐项 ✓/✗）
1. **导航栏**：悬浮圆角毛玻璃胶囊、左右层级清晰（品牌组/清空对话）、与主站导航风格呼应、375 不溢出
2. **滚动条**：thumb 与右侧气泡内容间距舒适（≥12px）、拖拽/滚轮正常、内容不足一屏隐藏
3. **空态引导**：面板紧凑聚焦（插画+标题+问候+chips 一屏内、无松散大空白）、换一批仍可用
4. **aside**：三面板紧凑统一、chips 密度合适、今日美味列表不臃肿、点站点自动填输入框仍生效
5. **输入条**：融入页面（无白色横带）、悬浮胶囊与页面自然过渡、发送/停止按钮可点区域 ≥44px、placeholder 轮换/聚焦固定/流态文案行为不变
6. **配色保留**：.ask-bubble-me 渐变白字、AI 米白气泡、暖纸渐变背景、樱花光斑**与原样一致**（可截图对比 task-13/01-ask-desktop.png）
7. 交互回归：发送→流式→停止/推荐卡片、chips 点击提问、清空对话、回主站、?q= 预填全部正常
8. verify 50/50 · lint 0/0 · build ✓
9. 375 移动端：单栏、无横向溢出、输入条 safe-area、空态/消息不破版
10. 暗色模式：header/输入条/气泡/侧栏暗色 token 正常（bg 换用现 token 或 ask-theme.css dark 块）

### 汇报格式
1. 改动清单（每项列出文件+行号+改法；注明 verify 无新增）
2. 验证结果（命令输出 + 清单 10 项逐条）
3. **3 张截图**：新 header + 双栏整体（桌面亮色）/ 输入条融入 + 滚动条间距（桌面）/ 375 移动端（含空态或有消息态）
4. 部署状态：本地验证 + 是否部署；未部署给出命令
5. 遗留问题与风险
