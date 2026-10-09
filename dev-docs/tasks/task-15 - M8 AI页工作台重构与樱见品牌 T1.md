# task-15 · M8 AI 页工作台重构 + 品牌「樱见」 T1

> 生成：2026-10-06 17:30 · 副参谋（已评审定稿）
> 前置必读：`dev-docs/STATUS.md`、task-14（M7 现状）、`src/ask/AskPage.jsx`、`AskChat.jsx`、`AskComposer.jsx`、`CustomScrollbar.jsx`、`src/ask/askCopy.js`、`src/styles/ask-theme.css`、`src/pages/HomePage.jsx`（仅 AI 入口按钮处）、`tests/verify.mjs`（场景 11）
> 前置状态：M1-M7 完成，verify 50/50

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\dev-docs\STATUS.md`、本任务文档、`E:\react\food-nav\src\ask\AskPage.jsx`、`AskChat.jsx`、`AskComposer.jsx`、`CustomScrollbar.jsx`、`src\ask\askCopy.js`、`src\styles\ask-theme.css`、`src\pages\HomePage.jsx`、`tests\verify.mjs`。

任务：**M8 AI 页工作台重构 + 品牌「樱见」**——①**空态改「工作台」grid 布局、进入对话后纯净单栏（彻底移除 aside 侧栏）**②header 去掉分隔线 span、主标题真正居中、返回/清空按钮改 SVG 图标③主站 AI 入口改 SVG 图标 + 品牌改名「樱见」④空态「灵感」鸡肋面板换成**本地记忆会话**（localStorage 恢复/继续上次对话）⑤滚动条加宽+圆角+间距加大⑥返回主站/清空对话按钮 SVG 图标化。**配色与 `.ask-bubble-me` 禁改；SSE/停止/推荐/发送交互逻辑一行不动**。

硬约束：主站 `src/components/**`、`index.css`、`tailwind.config.js`、`vite.config.js` 零改动（**HomePage.jsx 仅允许改 AI 入口按钮处**，且需同步 verify.mjs:664 断言文案）；verify 50 条语义全保留（**仅 1 处文案断言同步改名**，不新增）；零新依赖（图标用 lucide + morphicons 现有依赖，或内联 SVG）。

完成后按本文「✅ 验收与汇报」逐项验证并汇报（含 4 张截图：工作台空态 / 纯净对话态 / header 居中+图标按钮 / 375 移动端）。

---

## 📋 任务清单

### 1. 空态「工作台」重构（核心）

**目标**：空态 = 紧密结合的工作台 grid；进入对话（messages.length > 0）= 纯净单栏，aside 彻底消失。

**新组件 `src/ask/AskWorkspace.jsx`**（新建，禁 import 主站组件）：
```
AskPage 布局改为：
messages.length === 0
  ? <AskWorkspace onSuggest onPick onResume />   // 工作台（含输入提示，Composer 仍在底部）
  : <AskChat ... />                                // 纯净对话（main 全宽）
```
- 布局：`mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 pt-4 lg:grid-cols-3 min-h-0`（移动端单列堆叠）
  - 左大卡 `lg:col-span-2`（ask-panel ask-soft rounded-[24px] p-6）：现有空态内容迁移——AskIllustration（从 AskChat.jsx 移入，可保留在原文件导出）+ 标题（`樱见`）+ 问候（pickGreeting）+ 快捷提问 chips（pickChips 3-4 个，点击 handleChip 换一批+提问）+ 换一批灵感按钮（保留）
  - 右列 `lg:col-span-1 flex flex-col gap-4`：
    - **今日美味面板**（从 AskSidebar 迁移：pickDailySites(3)，点选 onPick → 填输入框，视觉/交互原样）
    - **最近会话面板**（新增，见任务 4）：有历史时显示「上次聊到：{最近问题截断 24 字}」+「继续上次对话」按钮（onResume）；无历史时显示轻引导「聊聊今天想吃什么吧」（不占位空洞）
- 移动端：grid-cols-1 堆叠，右列两个面板在插画卡下方

**删除**：AskPage.jsx 的 `AskSidebar` 组件（93-170 行整块）与 `<aside>` 使用点；AskChat.jsx 空态分支（180-213 行）改为直接渲染消息列表（或保留空态兜底但 AskPage 不再走到）——**推荐删除 AskChat 空态分支**，AskIllustration 移到 AskWorkspace（或 AskChat 导出复用）

**交互不变**：chips 点击提问（换一批+send）、今日美味点选填输入框、?q= 预填、Composer 始终在底部

### 2. Header 重构（AskPage.jsx:309-335）

- **删除分隔线**：`:320` 的 `ask-divider` span 整行删除（样式 ask-divider 若在 ask-theme.css 定义一并清理）
- **标题居中**：header 内层 `flex justify-between` → **`grid grid-cols-[auto_1fr_auto] items-center gap-2`**（左=返回按钮、中=标题 `text-center truncate`、右=清空按钮）——真正视觉居中，非 flex 近似居中
- **返回按钮 SVG 化**：`← 回到主站` 文字胶囊 → 圆形图标按钮（`h-9 w-9 rounded-full border border-white/90 bg-white/80` + lucide `ArrowLeft` 经 `<MorphIcon>`，或内联 SVG 左箭头）+ `aria-label="回到主站"`（**字面必须保留**，供测试脚本定位）；hover 保留 `-translate-y-0.5`
- **清空按钮 SVG 化**：`清空对话` 文字胶囊 → 圆形图标按钮（lucide `Trash2` 或内联垃圾桶 SVG）+ `aria-label="清空对话"`（**字面必须保留**）；disabled 态保留（messages 空或 streaming）
- 标题：`樱见`（text-base sm:text-card-title）+ 左加品牌小 logo（见任务 3 的 SVG，h-6 w-6）；375 下标题 truncate 不溢出
- 悬浮胶囊容器保留（rounded-[20px] bg-white/70 backdrop-blur-md mt-3 max-w-6xl）

### 3. 品牌改名「樱见」+ SVG 图标

- **名字**：全站 AI 品牌改 **「樱见」**（樱花 × AI 的"见"，与「食光」呼应）。文案替换点：
  - AskPage header 标题 `✨ 食光 AI 问答` → `樱见`（或 `樱见 · 美食 AI`，选一个，标题居中短一点用 `樱见`）
  - AskSidebar 品牌（已随 aside 删除）
  - askCopy.js：greeting/placeholder/chips 池若含"食光 AI"字样同步替换；品牌描述「站内美食挖一挖，下厨小问不迷路」保留
  - HomePage 入口按钮（见下）
- **主站入口按钮（HomePage.jsx:75-87，唯一允许改的主站文件）**：
  - `✨` emoji span → **SVG 图标**（lucide `Sparkles` 或 `MessageCircleHeart` 经 MorphIcon；或内联樱花五瓣 SVG——stroke #FF8FB1、五瓣 + 中心点，h-4 w-4）
  - 文案 `问问美食 AI` → **`问问樱见`**
  - 其余样式（贴纸胶囊/hover 形变）原样
- **AI 页品牌 logo**：header 标题左侧小 SVG（同樱花五瓣元素，h-6 w-6，可做渐变底圆角方块 `rounded-xl bg-gradient-to-br from-[#FF8FB1] to-[#FFB6CD]` + 白樱花）
- ⚠️ **verify.mjs:664 必须同步**：`includes('问问美食 AI')` → `includes('问问樱见')`（语义"入口按钮存在"不变）

### 4. 本地记忆会话（localStorage）

**新增 `src/ask/askHistory.js`**（或并入 askCopy.js，二选一，推荐独立文件）：
- 键 `food-nav:ask-history`；值 `{savedAt: number, messages: [...]}`
- `readAskHistory()`：结构校验（数组、每项 role∈{user,assistant}、content 字符串）→ 返回合法 messages 或 null；坏数据静默 null
- `writeAskHistory(messages)`：过滤无 content 项 → 只存最近 **20 条** → 每条 `{id, role, content, status:'done', sites:[...]}`（清掉 streaming/stopped/error 标记与 showSuggestions）→ try/catch 静默
- **AskPage 接入**：
  - `useState(() => readAskHistory() || [])` 恢复会话
  - messages 变化时 **800ms debounce 写入**（流式期间不狂写；卸载/clear 时 flush）
  - **idRef 初始化防撞**：恢复消息 id 可能很大 → `idRef.current = Math.max(0, ...messages.map(m => Number(m.id) || 0))`（否则新消息 id=1 与恢复消息 id 撞车，patchMessage 会误改历史消息）
  - `clear()`：清 localStorage（removeItem）+ setMessages([]) + idRef 重置 → 回工作台
- **工作台「最近会话」**：读 readAskHistory() → 显示 `上次聊到：{最后一条 user content 截断 24 字}` + 「继续上次对话」按钮 → onResume 恢复整个历史（同时把消息滚到底）；无历史显示轻引导
- **目的**：刷新/误关不丢对话；「清空对话」= 新会话闭环

### 5. 滚动条加宽 + 间距（CustomScrollbar.jsx / ask-theme.css / AskChat.jsx）

- thumb 类（AskChat 使用处或 ask-theme.css `.ask-thumb`）：`w-[3px]` → **`w-1.5`（6px）**；`right-1.5` → **`right-2`（8px）**；圆角 rounded-full 已有
- 消息容器（AskChat.jsx:217）：`px-3` → **`px-4`**（与 thumb 总间距 ≈ 12+8=20px，舒适）；`space-y-4` 保持
- hover 态 thumb 加深（`hover:bg-food-primary/70` 已有）保留；拖拽/滚动/隐藏逻辑零改动

### 6. 我主动发现的额外问题（一并处理）

1. **「灵感」面板与空态 chips 功能重复**（鸡肋根因）→ 已由「最近会话」面板替代（任务 1/4）
2. **AskChat 空态分支删除后**：确认没有其他引用 AskIllustration 的地方；`pickGreeting/pickChips` import 随之迁移
3. **发送按钮文字保留**「发送」（用户未要求改，且 verify.mjs:683 流式冒烟靠它定位——**勿动**）
4. **恢复会话后滚动到底**：AskChat 已有 messages 变化自动滚底 effect（166-170 行），恢复时 messages 初始即有值——**确认首帧滚底**（CustomScrollbar 的 useLayoutEffect update + AskChat effect 双保险，若恢复会话首帧未滚底需补一次）
5. **工作台与 Composer 衔接**：工作台 `flex-1 min-h-0` 占用剩余高度，Composer 在底部；375 下插画卡+两个面板堆叠后可滚动（工作台外层需 `overflow-y-auto` + ask-scroll）

---

## 🚫 禁止改动

- 配色方案与 `.ask-bubble-me`（樱花渐变/白字/圆角/阴影）**原样**
- SSE 解析、节流、Abort、停止、推荐机制、chips 点击语义、?q= 预填、发送按钮文字「发送」
- CustomScrollbar 的滚动手势/拖拽/重算逻辑（只改 thumb 宽度/right 类）
- 主站 `src/components/**`、`index.css`、`tailwind.config.js`、`vite.config.js`、`navSources.js`（HomePage.jsx **仅限** AI 入口按钮处）
- verify 50 条语义（仅 :664 文案随改名同步，不新增断言）
- 运行时依赖不新增

## ⚠️ 坑点预警

1. **idRef 撞 id**（最重要的坑）：恢复的 messages 保留原 id（如 5/6/7），新消息从 1 递增会撞车 → 初始化 `idRef.current = max(ids)+1`（任务 4 已列）
2. **verify:664 文案同步**：`问问美食 AI` → `问问樱见`，**必须同步改**否则场景 11 断言 ① 挂；其余 ask 断言（textarea、发送按钮）不受改名影响
3. **AskIllustration 迁移**：AskChat 空态分支删除后，插画组件要么移到 AskWorkspace、要么 AskChat 导出；两处 import 同步清理，防止残留未用变量（oxlint no-unused-vars）
4. **工作台滚动**：工作台内容在 375 可能超高 → 外层 `overflow-y-auto ask-scroll`（隐藏原生滚动条），Composer 始终可见
5. **最近会话防抖写入**：`setMessages` 后 debounce 800ms 写 localStorage；**组件卸载时 flush**（clearTimeout + 立即写）；streaming 期间 messages 每 50ms 变化——debounce 天然防狂写；恢复的会话不再触发写（初始值不写，只有用户操作后才写）
6. **MorphIcon 用法**：项目现有 `<MorphIcon iconNode={...} />`（lucide iconNode）——若对用法不确定，**内联 SVG 兜底**（stroke 1.8、strokeLinecap round、fill none、色 #FF8FB1/#4B3A55），两者都零新依赖
7. **header 三列 375**：返回图标 36px + 标题（truncate text-sm）+ 清空图标 36px + logo——标题需 `min-w-0 flex-1 text-center truncate` 才不溢出
8. **「继续上次对话」恢复后**：showSuggestions 已清（恢复数据不含）→ 不会弹建议 chips，符合预期；恢复后若想重新建议可不管
9. **PowerShell 写中文文件损坏 UTF-8** → 源码只用编辑器工具改

## ✅ 验收与汇报

### 验证命令
```
npm run lint · npm run build · npm run verify   # verify 50/50（:664 文案同步后仍全绿）
npx wrangler pages dev dist --port 8788         # 本地联调截图
```

### 手动验证清单（逐项 ✓/✗）
1. **工作台空态**：grid 布局（桌面 3 列：左插画问候+右今日美味/最近会话）、紧密结合无松散空白、移动端单列堆叠可滚动、chips 点击提问/换一批正常
2. **纯净对话态**：发一条消息后 aside/工作台消失、对话流全宽单栏、推荐卡片正常；清空对话回工作台
3. **header**：分隔线已删、标题「樱见」真正居中（视觉居中非近似）、返回/清空为 SVG 图标按钮（aria-label 保留）、375 不溢出
4. **主站入口**：SVG 图标 + 「问问樱见」、贴纸样式保留、点击进 /ask
5. **记忆会话**：聊几句 → 刷新 → 会话恢复（含气泡、滚动到底）；清空对话 → 历史清除 → 工作台「最近会话」消失；id 不撞（恢复后继续发消息，回复流正确追加到新 AI 气泡）
6. **最近会话面板**：有历史显示「上次聊到…」+ 继续按钮（点击恢复）；无历史显示轻引导
7. **滚动条**：宽 6px、圆角、与对话内容间距 ≈20px、拖拽/滚轮正常、不足一屏隐藏
8. **配色保留**：.ask-bubble-me、暖纸渐变、樱花光斑原样（对照 task-14/01-header-two-col.png）
9. **交互回归**：发送→流式→停止/推荐卡片、chips、?q= 预填、回主站、reduced-motion 全过
10. verify 50/50 · lint 0/0 · build ✓；主站首页/懒加载/主题/收藏回归正常
11. 暗色模式：工作台/header/最近会话/输入条暗色 token 正常
12. 375：无横向溢出、Composer safe-area、工作台可滚动

### 汇报格式
1. 改动清单（新增/修改文件 + verify 变更说明）
2. 验证结果（命令输出 + 清单 12 项逐条）
3. **4 张截图**：工作台空态（桌面）/ 纯净对话态 / header 居中+图标按钮 / 375 移动端
4. 部署状态：本地验证 + 是否部署；未部署给出命令
5. 遗留问题与风险
