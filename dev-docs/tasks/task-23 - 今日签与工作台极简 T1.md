# task-23 · 今日签 + AI 工作台极简 T1

> 背景：M1-M10 已上线并提交 GitHub（main）。本次纯前端体验优化，两个目标：
> ① 首页新增「今日签」贴纸卡（每日种子固定 + 点击摇签换签，连真实站点数据）
> ② AI「樱见」工作台砍掉静态鸡肋面板，极简化；最近会话收进 header 图标浮层
>
> 设计方向：既然访问量少，就做成「自己每天打开会笑一下」的小站。贴纸风、樱花玻璃、硬阴影，与现有语言统一。

---

## 先读这些文件（动手前必读）

- `src/pages/HomePage.jsx` — Hero 结构、useNavData 注入的 groups、AI 入口按钮位置
- `src/components/effects/SakuraBurst.jsx` — 全局点击溅花瓣（document 捕获，签卡点击会自动溅，设计预期）
- `src/ask/AskWorkspace.jsx` — 当前工作台 3 列 grid（要砍面板）
- `src/ask/AskPage.jsx` — header 按钮组、view 状态机、backToWorkspace
- `src/ask/askHistory.js` — 会话存储（getSessions / removeSession / persistSessions）
- `src/styles/ask-theme.css` — 现有 ask token（ask-panel / ask-bubble / ask-chip 等）
- `src/index.css` — 主站 token（bg-food-surface / border-food-line / shadow-foodSticker）
- `tests/verify.mjs` — 52 断言契约（找 ask 相关段，注意工作台删面板后哪些断言要跟着改）
- `dev-docs/STATUS.md` — 项目现状

---

## 任务 1：首页「今日签」贴纸卡

### 新建组件
`src/components/DailyFortune/DailyFortune.jsx`（纯前端组件，不改现有组件）

### 位置
HomePage 的 Hero 区：**打字机 TypeWriterQuote 下方、搜索框上方**。一行紧凑贴纸，不挤压现有布局。

### 交互逻辑
1. **日期种子固定**：`new Date()` → `YYYY-MM-DD` 字符串做一个简单 hash（如 charCode 累加 % n）→
   - 先抽分类 index（从 `groups` 数组抽，groups 由 useNavData 注入 HomePage，签卡接收 `groups` prop）
   - 再从该分类的 sites 里抽一个站 index
   - 结果：同一天刷新/重开页面，签文一致（像每日运势）
2. **点击签卡主体** → 摇签动画（CSS keyframe：左右摇晃 0.6s，`transform: rotate` 几帧）→ 花瓣溅出（SakuraBurst 全局捕获 document click，自动触发，不用手写）→ 用 `Math.random()` 重新随机换签（不再固定）
3. **签卡上的站点名 = 小链接**：`target=_blank rel="noopener noreferrer"`，点击直达该站（`e.stopPropagation()`，不触发摇签）
4. **groups 为空时**（极端情况）组件 render null，不白屏

### 签文模板池（组件内常量，3-4 条轮换）
- `今日宜吃：{分类名} → {站点名}`
- `今天来点{分类}？试试{站点名}`
- `饿了的话，{站点名} 不错哦`
- `今日签：{分类名}の{站点名}`

### 样式
- 贴纸风小卡：`rounded-2xl` + `border-2` + `shadow-foodSticker`（或 shadow-foodTab）+ `bg-food-surface` + `border-food-line`
- 前缀一个 `🎴` 或 `🌸` emoji
- `text-sm`、一行紧凑、`py-2 px-4`
- 暗色 token 自动适配（用 token 类，不要硬编码颜色）
- 站点名过长时 `truncate max-w-[120px]`

### 移动端
375px 整行不溢出；签卡 flex-wrap 可换行。

---

## 任务 2：AI 工作台极简

### 改造 1：AskWorkspace.jsx 砍面板
- **删掉**「今日美味」和「最近会话」两个静态面板（用户判定鸡肋）
- 工作台改为**单列居中**：插画（保留现有）+ 问候文案（保留）+ 大输入框 AskComposer（保留现有）+ chips 灵感（换一批，保留）
- 布局从 3 列 grid 改为 flex 垂直居中单列

### 改造 2：最近会话收进 header History 图标
- AskPage.jsx header 右侧按钮组（现有：返回工作台 | 清空对话）**加一个 History 图标按钮**
  - 图标用 lucide `History`（经 Morphicon，与现有 SVG 图标按钮同一尺寸 h-9）
  - `aria-label="历史对话"`
- 点击 toggle 展开下拉浮层：
  - 定位：`absolute right-0 top-full mt-2 z-50`，玻璃面板（bg-food-surface/backdrop-blur + border + rounded）
  - 内容 = `askHistory.getSessions()`（复用现有存储）：每条显示 savedAt 时间 + 首条消息预览（截断 20 字）
  - 每条点击 → 恢复该会话（复用现有「继续上次对话」逻辑，切换到对应 sessionId）
  - 每条右侧 Trash2 删除钮（复用 `removeSession(id)`），删除后面板刷新
  - 空历史 → 浮层显示「还没有对话记录 🌸」
  - 点击浮层外部关闭（useEffect document click 监听，忽略浮层自身点击）
- **view=chat（对话中）也显示 History 按钮**——任何时候可看历史

---

## 禁止红线

- `src/components/NavCard/**`、`src/components/Layout/**`、`MusicPlayer/**`、`TypeWriterQuote.tsx`、主站 Header.jsx **零改动**（除 HomePage.jsx 挂签卡组件 + 传 groups prop）
- ask 流式 SSE / 节流 / AbortController / 停止 / ?q= 预填 / 返回工作台逻辑**逐行不动**
- 不新增 npm 依赖
- 不改 tailwind.config.js、index.css 既有 token（只复用）
- tests/verify.mjs 52 条断言语义保持；若工作台删面板导致某条 ask 断言失败，**按新语义更新断言文本**（允许 ±2 条新断言：签卡存在、History 按钮存在），不能删断言数

---

## 坑点预警

1. **verify.mjs ask 段**：可能有断言引用了旧工作台的文案（「今日美味」等）——改工作台后先 grep verify.mjs，按新文案同步断言
2. 签卡站点名链接 `e.stopPropagation()`，避免点链接也触发摇签
3. 日期种子用**本地 Date**（用户本地时区，不要用 UTC，不然跨零点会跳签）
4. History 浮层点击外部关闭：注意 header 其他按钮（返回/清空）点击时浮层要收起
5. SakuraBurst 是全局 document click 捕获——签卡摇签时花瓣会溅出来，这是**设计预期**，不要拦
6. HomePage 的 groups 来自 useNavData（可能是快照 23 站或 API 实时），签卡从 groups 抽时注意分类可能为空（某分类 0 站就跳过换下一个分类）
7. PowerShell 别用来写中文文件（会乱码）——所有源码用编辑器工具改

---

## 验收清单（完成后逐项验证并汇报）

```
命令基线：
  npm run lint   → 0 警告 0 错误
  npm run build  → ✓
  npm run verify → 全过（52 ± 2 条）

手动清单：
 1. 首页打字机下方出现签卡（今日宜吃：X → Y），贴纸风
 2. 同一天刷新页面签文一致；点签卡 → 摇晃动画 + 花瓣溅出 → 换签（不同站）
 3. 点签卡站点名 → 新窗口打开该站，不触发摇签
 4. 暗色模式签卡 token 正常
 5. 首页 375px 签卡不溢出
 6. /ask 工作台：无「今日美味」「最近会话」面板，单列居中（插画+问候+输入框+chips）
 7. header History 图标点开 → 浮层列出历史会话；点一条恢复对话；Trash 删除生效；点外部关闭
 8. 对话中 History 图标也在，点开正常
 9. 流式发送/停止/返回工作台/清空/?q= 预填 全回归正常
10. 主站收藏/主题/搜索/音乐播放器 无回归

截图（3 张，存 dev-docs/reports/task-23/）：
  01-home-fortune-light.png — 首页签卡亮色
  02-ask-workspace-minimal.png — /ask 极简工作台空态
  03-history-dropdown.png — History 浮层展开
```

---

## 部署状态
默认不部署。完成后汇报，由指挥官决定是否 `npm run build && npx wrangler pages deploy dist --project-name food-nav`。
