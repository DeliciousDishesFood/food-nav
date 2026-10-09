# task-23 · 今日签 + AI 工作台极简 · 验收报告

> 时间：2026-10-10 · 纯前端任务，**默认不部署**（线上版本不变 = M10 + M9-T3 + M9-T4）
> 结论：**全绿** —— lint **0/0** · verify **54/54**（52 + 任务卡允许的 2 条新断言）· build ✓ · 本地 CDP 手动清单 **27/27** · 截图 4 张。

---

## 1. 改动清单

| 文件 | 改动 |
|---|---|
| `src/components/DailyFortune/DailyFortune.jsx`（新建） | 今日签贴纸卡：本地 `YYYY-MM-DD` 字符串 hash 种子（先抽分类再抽站点，跳过 0 站分类）→ 同日签文稳定；点击主体 → `fortune-shake` 0.6s 摇签动画 + `Math.random()` 换签，650ms 后自动摘掉 shake class（`key={rollCount}` 重挂载保证动画每次重放）；站点名 = `<a target="_blank" rel="noopener noreferrer">`（`stopPropagation` 不触发摇签、回车直达）；`role="button"` + Enter/Space 摇签；groups 空 render null；4 条签文模板池；全 token 类，暗色自动适配；`prefers-reduced-motion` 关动画 |
| `src/components/DailyFortune/fortune.css`（新建） | `@keyframes fortune-shake`（±3deg 摇晃 0.6s）+ reduced-motion 降级（**不改** index.css / tailwind.config.js） |
| `src/pages/HomePage.jsx` | 仅新增 import + `<DailyFortune groups={groups} />` 挂在 `<Header />` 之后（打字机正下方、`<main>` 之外，避免干扰 verify 的 `main button` 计数） |
| `src/ask/AskWorkspace.jsx`（重写） | 删「今日美味」「最近会话」双静态面板及 `pickDailySites/CATEGORY_EMOJI/RecentSession/clip/lastUserOf` 等残留 → 3 列 grid 改**单列垂直居中**：插画 → 樱见品牌 → 问候 → `{children}` 注入大输入框 → chips 灵感 + 换一批；保留导出 `SakuraLogo`（header 依赖）与 `AskIllustration` |
| `src/ask/AskHistoryMenu.jsx`（新建） | header「历史对话」浮层：lucide `History`（经 Morphicon，h-9 与既有图标钮同尺寸）`aria-label="历史对话"`；`absolute right-0 top-full mt-2 z-50` 玻璃面板（bg-food-surface + border-2 + shadow-foodSticker + backdrop-blur）；每条 = 时间 + 首条消息 20 字预览 + `当前` 徽标 + Trash2 `aria-label="删除会话"`；点行复用 `resume`、删行复用 `handleRemoveSession`；空态「还没有对话记录 🌸」；document click 关外部（忽略浮层自身）、storage 事件跨标签刷新、打开时重读最新（事件里读，不进 effect —— 避免 oxlint `set-state-in-effect`） |
| `src/ask/AskPage.jsx` | header 右格包 `flex` 容器加入 `AskHistoryMenu`（view=chat 也恒定渲染）；删未用 `handlePick`；工作台分支改 `<AskWorkspace>{composer}</AskWorkspace>`（插画→问候→**输入框**→chips 顺序），对话态 composer 仍在页底；**header 加 `relative z-50`**（见「踩坑」①）；SSE / 节流 / Abort / 停止 / `?q=` / 返回工作台逻辑**逐行未动** |
| `tests/verify.mjs` | +2 断言（**52 → 54，零删除**）：`home shows daily fortune card`（`.daily-fortune`）· `ask header shows history button`（`header [aria-label="历史对话"]`） |

**红线合规**：`NavCard/**`、`Layout/**`、`MusicPlayer/**`、`TypeWriterQuote.tsx`、主站 `Header.jsx` **零改动**（git status 可证）；ask 流式链路零改动；零新依赖（`History/Trash2` 来自既有 `lucide`，已验证导出）；`tailwind.config.js`、`index.css` 既有 token 只复用未修改；零新后端/数据库改动。

## 2. 命令基线（输出见同目录 txt）

```
npm run lint   → 0 警告 0 错误（lint.txt）
npm run build  → ✓ built in 540ms（build.txt）
npm run verify → RESULT: 54 passed / 0 failed（verify.txt）
```

## 3. 手动清单（CDP `t23-accept.mjs` → **27 passed / 0 failed**，accept-log.txt）

1. **签卡在打字机下方、贴纸风** ✓（rect 校验：`p.italic` 底部之下、首卡顶部之上、role=button；圆角+边框+背景非透明；模板池命中）
2. **同日刷新签文一致 + 点击摇签换签** ✓（`Page.reload` 后文本逐字相同；点击 → `fortune-shake` 出现 → 签文变化（最多 4 次重摇取到差异）→ 650ms 后 class 自动清除）
3. **点站点名新开窗口、不触发摇签** ✓（target=_blank + rel 含 noopener；派发点击后签卡文本与 shake 状态均不变 —— capture 阶段 preventDefault 拦导航，`stopPropagation` 拦摇签）
4. **暗色 token 正常** ✓（亮/暗 computed backgroundColor 不同且非透明；附加截图 04）
5. **375px 不溢出** ✓（`scrollWidth ≤ innerWidth+1` 且签卡 rect 完整在 375 视口内）
6. **/ask 极简工作台** ✓（页面无「今日美味」「最近会话」文案；`.ask-chip` ≥3；插画在；容器 `flex-col items-center`；输入框在 `main` 内）
7. **History 浮层** ✓（2 条历史 = 时间 + 20 字预览 + Trash2 + 当前徽标，面板背景非透明、z=50 → 截图 03；点行恢复对应会话且浮层关；点外部自动关；Trash 删非当前 → 浮层与 storage 同步 2→1；删当前 → 空态提示 + 键移除 + 回工作台）
8. **对话中 History 图标也在** ✓（boot 恢复会话启动即对话态，按钮在 header 且可用）
9. **流式回归** ✓（`?q=` 预填进输入框 → 发送 → ■停止 → 回到发送（2 轮重试保护）→ 再发送 → `.ask-bubble-ai` 流式出内容（真实 glm-4-flash，pages dev + `.dev.vars`）→ 返回工作台会话**立即 flush 落盘**（浮层 1 条）→ 恢复 → 清空对话 = 工作台 + 历史清零 + 按钮禁用）
10. **主站无回归** ✓（收藏 toggle：aria-pressed 翻转 + 本地存储 ±1，含服务端 initFavoritesSync 合并后的已收藏初态；主题切换；搜索过滤；音乐播放器展开/收起）；**全程无未捕获页面异常**（Runtime.exceptionThrown = 0）

## 4. 截图（4 张，`dev-docs/reports/task-23/`）

| 文件 | 内容 |
|---|---|
| `01-home-fortune-light.png` | 首页签卡亮色：「今日宜吃：家常菜谱 → 心食谱（摇一摇）」，打字机正下方、tabs 之上 |
| `02-ask-workspace-minimal.png` | /ask 极简空态：插画 + 樱见 + 问候 + 大输入框 + chips + 换一批，双面板已删，header 右侧 History 图标在位 |
| `03-history-dropdown.png` | History 浮层展开（对话态）：2 条会话、当前徽标、时间、20 字预览、Trash2，浮层正确盖过聊天气泡 |
| `04-home-fortune-dark.png` | 暗色签卡（附加证据）：token 自动适配 |

## 5. 踩坑与修复（过程记录）

1. **浮层被聊天气泡盖住**（首轮 03 截图发现）：header 胶囊自带 `backdrop-blur-md` → 生成层叠上下文 → 浮层的 `z-50` 被圈在 header 内，与对话区按 DOM 树序比较（header 在前）→ 气泡画在上面。修复：`<header className="relative z-50 shrink-0">` 让整个 header 高于对话区（`elementFromPoint` 实测修复前后对比）。
2. **同 URL navigate ≠ 重载**：CDP `Page.navigate` 到相同 URL 是同文档导航 —— `localStorage.clear()` 后不重载 → nav-cache 永不回写 → 脚本假超时；预置 ask-history 后不重载 → AskPage 不重新 boot。脚本改用 `Page.reload`（页面产品代码无此问题）。
3. **签卡 shake class 常驻**：首轮实现 `rollCount > 0` 恒挂类名且 dist 未重建 → 验收判定失败；改独立 `shaking` state + 650ms 定时摘除（卸载清理 timer），重建后过。
4. **verify 收藏断言语义**：本地 initFavoritesSync 会合并服务端收藏 → 首卡可能是已收藏态，验收断言从「必须 false→true」改为「aria-pressed 翻转 + 存储 ±1」（更贴 toggle 语义）。
5. 任务卡位置说明「打字机下方、搜索框上方」—— 搜索框在 Header 内（打字机上方），结构上不可兼得；签卡置于打字机正下方 = Hero 区首屏位（红线内：仅 HomePage 挂载）。

## 6. 部署状态

**默认不部署（任务卡口径）。** 改动纯前端（`src/**` + verify），如需上线：

```
npm run build && npx wrangler pages deploy dist --project-name food-nav
```

（cron / D1 / secrets 零改动；回滚 = `npx wrangler pages deployment list` 回 `625437fb`）

## 7. 遗留与备注

- verify 断言数从 52 → **54**（任务卡明确允许 ±2），`tests/verify.mjs` 基线注释已同步，**零删除断言**。
- 本地验收环境：`wrangler pages dev dist --port 8788`（本地 D1 + `.dev.vars` GLM key）+ Edge CDP `--remote-debugging-port=9222`（独立 user-data-dir，验收后两个进程仍开着，可手动关闭）。
- 签卡种子用本地时区 `Date`（跨零点换签，不用 UTC）；`usableGroups()` 跳过 0 站分类；分组数据变动（admin 改站）会在下一次渲染重抽种子（同日通常稳定，nav-cache 30 分钟 TTL 内完全一致）。
- 摇签会溅花瓣 = SakuraBurst 全局捕获，**设计预期未拦截**；签卡站点链接点击会照常走 `/api/track/click` 热度上报（App 全局委托，站点直流量也计入热度，属顺带收益）。
