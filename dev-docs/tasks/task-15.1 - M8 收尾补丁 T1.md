# task-15.1 · M8 收尾补丁（滚动条间距 + 小屏隐藏） T1

> 生成：2026-10-06 18:10 · 副参谋
> 前置必读：task-15（M8 现状）、`src/ask/AskChat.jsx`（消息容器）、`src/styles/ask-theme.css`（.ask-thumb）
> 前置状态：M8 功能完成，验收脚本 100/100，**尚未跑 lint/build/verify**

---

## 🚀 启动指令（可直接整段复制）

先读 `E:\react\food-nav\dev-docs\tasks\task-15 - M8 AI页工作台重构与樱见品牌 T1.md`（现状）、`E:\react\food-nav\src\ask\AskChat.jsx`、`src\styles\ask-theme.css`、`tests\verify.mjs`。

任务：**M8 收尾补丁**——①滚动条与对话内容净距调至 ≈20px（现状仅 2px：内容 pr-4=16px，thumb 右缘 8px+宽 6px=14px，16-14=2px 贴脸）②小屏（<1024px，与导航栏压缩范围平齐）隐藏自制滚动条 thumb，大屏保留 ③随后跑完整验证并出 M8 最终汇报 + 更新 STATUS.md。

硬约束：只改两处样式 + 跑验证；配色/交互/布局逻辑零改动；verify 50 语义保留。

## 📋 任务清单

### 1. 滚动条净距 ≈20px
- `AskChat.jsx` 消息容器：`px-4` → **`pl-4 pr-7`**（左 16px 保持紧凑，右 28px 给滚动条留轨）
- `CustomScrollbar.jsx` thumb（或 ask-theme.css 类）：`right-2` → **`right-1`**（4px）
- 计算结果：内容右缘 28px − thumb 左缘（4px+6px=10px）= **18px 净距**（感知 ≈20px，含圆角视觉）
- 工作台空态/今日美味面板无滚动条，**不动**

### 2. 小屏隐藏 thumb（纯 CSS）
- `ask-theme.css` 加：
```css
.ask-thumb { display: none; }
@media (min-width: 1024px) { .ask-thumb { display: block; } }
```
- 原生滚动条已被 `.ask-scroll` 隐藏 → <1024px 时无可见滚动条（滚轮/触摸仍可滚，主流做法）；CustomScrollbar 的 JS 拖拽/重算逻辑零改动（thumb 渲染条件不变，只是 CSS 不显示）

### 3. 完整验证 + M8 最终汇报
- `npm run lint` → 0/0；`npm run build` → ✓；`npm run verify` → **50/50**
- 回归 task-15 验收脚本（CDP，100 条）
- 补 1 张截图：滚动条间距（桌面对话态，可见 18-20px 净距）+ 小屏无滚动条（375 截图可复用或新截）
- **更新 `dev-docs/STATUS.md`**：M8 完成（verify 50/50、工作台重构/樱见品牌/记忆会话/滚动条）、部署状态（未部署，待 M9 批次或单独部署）、交付清单追加 M8 小节、下一步 M9

## ✅ 验收与汇报
按 task-15 汇报格式输出（改动清单 / 验证结果 / 截图 / 部署状态 / 遗留）。
