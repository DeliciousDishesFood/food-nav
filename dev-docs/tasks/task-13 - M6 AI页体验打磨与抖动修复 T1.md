# task-13 · M6 AI 页体验打磨 + 主站抖动修复 T1

> 生成：2026-10-05 · 副参谋（已评审定稿）
> 前置必读：`dev-docs/STATUS.md`、task-12（M5 交付现状）、`src/ask/*`、`src/api/navApi.js`、`src/pages/HomePage.jsx`
> 前置状态：M1-M5 完成并部署（49/49）；本任务为体验打磨 + 缺陷修复

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\dev-docs\STATUS.md`、本任务文档、`E:\react\food-nav\src\ask\AskPage.jsx`、`AskChat.jsx`、`AskComposer.jsx`、`AskCard.jsx`、`src\api\navApi.js`、`src\pages\HomePage.jsx`、`src\admin\AdminSiteForm.jsx`、`src\admin\AdminShell.jsx`、`tests\verify.mjs`。

任务：**M6 体验打磨**——① **AI 页视觉重构**（脱离贴纸硬阴影风，探索「暖纸面 + 樱花渐变 + 轻投影 + 大留白」新风格；桌面双栏/移动单栏；气泡/空态/动效全面升级）② **placeholder 与建议 chips 灵动化**（轮换池 + 动态生成，去掉固定设问句）③ **滚动条修复**：输入框隐藏原生滚动条 + auto-grow；聊天记录区做 **CustomScrollbar 组件**（div 模拟 thumb，隐藏原生）④ **流式光标修复**（em 跟随行高，不再基线偏移）⑤ **主站回页抖动修复**（navApi 加 localStorage 缓存优先，消除快照→API 硬替换 swap）⑥ **overflow 截断修复**（AskPage main 的 overflow-hidden、用户气泡右截断、AdminSiteForm 图标格 hover 顶部被裁）。

硬约束：主站 `src/components/**` 零改动；`navSources.js`/`index.css`/`tailwind.config.js`/`vite.config.js` 不动（CustomScrollbar 放 `src/ask/`，样式可用现有 token 或新文件 `src/styles/ask-theme.css`）；verify 47 语义全保留 + **新增 1 条（nav-cache 写入）→ 48**；运行时依赖不新增；AI 问答/停止/推荐卡片的**交互逻辑零改动**（只改视觉与滚动/光标表现）。

完成后按本文「✅ 验收与汇报」逐项验证并汇报（含 3 张截图：AI 页新视觉 + 推荐卡片 / 主站回页无抖动前后 / 375）。

---

## 📋 任务清单

### 1. AI 页视觉重构（src/ask/ + src/styles/ask-theme.css 新增）

**风格方向（脱离贴纸硬阴影，探索新视觉但延续品牌）**：
- 背景：柔和渐变（`linear-gradient(180deg, #FFF5F9 → #FDF7FF → #F4F9FF)` 粉→淡紫→微蓝，与主站星星夜色呼应但更浅）；可加极淡樱花粒子/光斑装饰（CSS 径向渐变即可，不做重动画）
- 投影语言：主站是硬阴影（shadow-foodSticker 0 偏移），AI 页改 **柔和弥散投影**（如 `shadow-[0_8px_30px_rgba(244,114,182,0.12)]`）；边框从 border-2 降为 border（1px）细线
- 圆角：气泡/卡片 `rounded-[20px]`（比主站 2xl 更柔）
- **布局**：桌面双栏——左（主聊天：消息流 + 底部输入）；右（侧栏：品牌区 + 灵感 chips + 「今日美味」随机站点 2-3 个）；移动端单栏（侧栏内容并入顶部或隐藏）
- 气泡：AI = 白/米白底（bg-white/70 backdrop-blur）+ 柔影 + 细边；用户 = 粉色渐变（`bg-gradient-to-br from-[#FF8FB1] to-[#FFB6CD]` 白字）+ 柔影；头像：AI 用 ✨（或 MorphIcon Sparkles），用户用 🌸，圆底浅色
- 空态：大留白 + 品牌插画位（可复用现有 CoverPlaceholder 的 SVG 元素思路**新建**独立插画，禁 import 主站组件）+ 灵动问候（见第 2 条）
- 动效：气泡进入 `fade-up`（复用 fade.css 或 ask-theme.css 内新 keyframes，错落 stagger 30ms）；AI 回复完成后推荐卡片组**逐张**淡入（间隔 60ms）；流式光标闪烁保留
- 输入区：固定在页面底部（不遮挡），圆角大输入条（如 rounded-[24px]），发送按钮圆形渐变
- **禁改**：AskPage 的 SSE 解析/节流/Abort/停止逻辑、AskChat 的消息结构、AskCard 的交互（target=_blank 等）——只改 className/布局/新增侧栏

### 2. placeholder 与建议 chips 灵动化

- **placeholder 轮换池**（AskComposer）：池子 ≥8 条**场景化短语**（非固定设问句），例：「深夜想吃点甜的？」「搜个菜谱网站」「今天晚饭没头绪」「烘焙新手第一步」「找家奶茶店」「解释一个烘焙名词」——每 6-8s 轮换一次（setInterval，卸载清理）；**聚焦时固定**为「问我任何关于美食的问题…」；streaming 时「美食 AI 正在回答…」保持
- **建议 chips 动态生成**（AskChat 空态 + 回复后）：从「分类名 × 动作」模板随机组合（分类来自主站 groups 或写死池）+ 随机池混合，**每次进入/每次刷新随机 3-4 个**；点击后换一批新的（防呆板）；chips 文案避免「有什么…推荐吗？」句式
- 空态问候语轮换：从问候池（≥5 条）随机取一条渲染

### 3. 滚动条修复

- **输入框（AskComposer）**：textarea 隐藏原生滚动条（`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`）；auto-grow 保留（≤150px 封顶，超高后内部滚动但**无可见滚动条**，滚轮可滚）
- **聊天记录区（AskChat）**：新增 `src/ask/CustomScrollbar.jsx`——div 模拟滚动条：
  - 外层 `relative overflow-hidden` → 内层 `overflow-y-auto`（原生滚动保留功能，仅视觉隐藏）
  - 右侧绝对定位 thumb div：高度 = `视口高/内容高 × 100%`（min 24px）；top = `scrollTop/内容高 × 视口高`
  - 支持：内容/窗口变化重算（ResizeObserver + scroll 事件）、**拖拽 thumb**（pointer events）、点击轨道跳转（可选）；内容不足一屏时 thumb 隐藏
  - 视觉：2-3px 宽、圆角、`bg-food-primary/40 hover:bg-food-primary/70`、右侧 4px 间距
- ask 页整体：容器级滚动条统一隐藏（ask-theme.css 里定义 `.ask-scroll` 工具类）

### 4. 流式光标修复（AskChat）

- 现实现：`h-4 w-2 translate-y-0.5 align-middle`（基线偏移）
- 改：`inline-block h-[1em] w-[2px] translate-y-[0.2em] animate-pulse bg-food-primary`（**em 跟随字号**、translateY 0.2em 行内居中、去掉 align-middle、ml-1）；无内容思考中状态光标跟随「思考中…」文本后

### 5. 主站回页抖动修复（navApi.js）

根因：首帧 SNAPSHOT_GROUPS（navSources 静态）→ API 数据到达后硬替换；admin 改过数据时内容/排序不同 → 卡片瞬移交换。
- **nav-cache 缓存优先**：
  - 新增 `CACHE_KEY='food-nav:nav-cache'`、`CACHE_TTL_MS=30*60*1000`（30 分钟）
  - `useNavData`：首帧读取缓存（结构校验：非空数组 + 每项有 categoryKey/items）→ 有则直接渲染缓存（degraded=false）；无缓存才用 SNAPSHOT_GROUPS
  - fetch 成功后：写入缓存（含时间戳）+ setState
  - fetch 失败：**若已有缓存则继续用缓存**（degraded=false 不弹降级条）；无缓存才 SNAPSHOT_GROUPS + degraded=true
  - 缓存数据结构：`{savedAt: number, groups: [...]}`；过期即忽略当快照用
- 效果：回主页/刷新 → 首帧 = 最近一次真实 API 数据（与后端一致）→ 无 swap；admin 改过数据 30 分钟内刷新也一致
- **verify 新增 1 条**：mock API 成功后断言 localStorage 写入 `food-nav:nav-cache` 且含站点（→ 48）

### 6. overflow 截断修复

- **AskPage.jsx `<main>`**：`overflow-hidden` → `overflow-x-hidden`（纵向由聊天区自己滚动，不再横向硬裁）；内部气泡容器/气泡加 `min-w-0 max-w-full` + `overflow-wrap:anywhere`（比 break-word 更强，长 URL 必断）
- **用户气泡**：`max-w-[85%]` 保留但补 `min-w-0` + `overflow-wrap:anywhere`
- **AdminSiteForm.jsx 图标选择器格子**（约 329-330 行）：`h-14 overflow-hidden ... hover:-translate-y-0.5` → **去掉 overflow-hidden**（图标不越界，圆角由背景承载）或动画改 `hover:scale-105`；保证 hover 上移时顶部不被裁
- 全局排查：grep `overflow-hidden` 在 src/ask 与 src/admin，**逐处判断**是否裁掉 hover 上移/悬浮内容；只修有问题的（如带 hover:-translate-y-* 的容器）

---

## 🚫 禁止改动

- `src/components/**`、`navSources.js`、`index.css`、`tailwind.config.js`、`vite.config.js`、`package.json`
- verify.mjs 原 47 条断言语义
- AI 问答交互逻辑（SSE 解析/节流/停止/推荐机制/会话上下文）
- 主站分类/懒加载/主题/播放器等全部现有功能

## ⚠️ 坑点预警

1. **视觉重构只动 className/布局**：AskPage/AskChat 的 JS 逻辑（fetch/SSE/Abort/messages 结构）**一行不动**；改错交互即回归
2. **CustomScrollbar**：内层必须保留原生滚动（`scrollbar-width:none` + webkit display:none 只是隐藏），否则滚轮/触摸失效；thumb 拖拽用 pointer events（`setPointerCapture`），防文本选择；ResizeObserver 监听内容变化重算
3. **placeholder 轮换**：setInterval 必须 cleanup；聚焦/streaming 状态优先级（聚焦 > streaming > 轮换）
4. **nav-cache**：写缓存前 JSON 结构校验；TTL 30 分钟；**缓存失败静默**（localStorage 满/隐私模式 try/catch）；缓存不覆盖 degraded 语义（有缓存失败 = 正常态不弹条）
5. **em 光标**：`h-[1em]` 随字号变化自动适配，验证中文/英文/空内容三种情况下的位置（右边缘、居中、思考中）
6. **overflow 修复**：AskPage main 改 `overflow-x-hidden` 后验证聊天区纵向滚动正常；AdminSiteForm 图标格去 overflow-hidden 后验证圆角视觉（可在格内加 `rounded-xl` 背景层保圆角裁剪视觉）
7. **双栏布局**：右栏只在桌面（`hidden lg:block`）；移动端单栏完整可用；右栏内容（灵感 chips/今日美味）数据可静态（从 SNAPSHOT_GROUPS 或 API groups 取，禁新接口）
8. **fade/stagger 动效**：尊重 `prefers-reduced-motion`（降级为无动画）；动画不影响交互（pointer-events 正常）
9. verify：nav-cache 断言在 mock 成功后 await 写入；原 mock 结构不动
10. PowerShell 写中文文件损坏 UTF-8 → 源码只用编辑器工具改

## ✅ 验收与汇报

### 验证命令
```
npm run lint · npm run build · npm run verify   # verify 48/48，原 47 全绿
npx wrangler pages dev dist --port 8788         # 本地联调
```

### 手动验证清单（逐项 ✓/✗）
1. **AI 页新视觉**：暖纸渐变背景 + 柔影细边；桌面双栏（聊天+侧栏）/375 单栏完整；气泡样式升级；进入动画错落自然
2. **placeholder 轮换**：静置 8s 文案变化；聚焦后固定；streaming 显示回答中
3. **chips 动态**：空态每次进入随机 3-4 个；点击后换一批；无固定设问句
4. **输入框**：无原生滚动条；输入 10 行内自动增高；超 150px 内部滚动无可见滚动条（滚轮可用）
5. **聊天区 CustomScrollbar**：原生滚动条隐藏；thumb 高度/位置随滚动正确；可拖拽；内容不足一屏隐藏；消息增长后 thumb 重算
6. **光标**：跟随文本末尾、垂直居中（中/英/空内容三种场景截图或描述）
7. **主站抖动**：**修改一条站点数据（admin）→ 回主页 → 首帧直接显示新数据、无快照闪一下**（刷新亦同）；无缓存时首次加载仍正常降级
8. **overflow**：长 URL 用户消息右侧不再被裁；admin 图标选择器 hover 顶部完整显示
9. 推荐卡片/停止/会话追问等 M5 交互全部回归正常
10. verify 48/48 · lint 0/0 · build ✓；M4 热度/UV、M3 检测回归正常
11. 移动端 375：AI 页单栏无溢出、输入区不遮挡

### 汇报格式
1. 改动清单（新增/修改文件 + verify diff）
2. 验证结果（命令输出 + 清单 11 项逐条）
3. **3 张截图**：AI 页新视觉（桌面双栏 + 气泡 + 推荐卡片）/ 主站回页无抖动（前后对比或首帧截图）/ 375 移动端
4. 部署状态：本地验证 + 是否部署；未部署给出命令
5. 遗留问题与风险
