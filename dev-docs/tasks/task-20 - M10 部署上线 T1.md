# task-20 · M10 部署上线 T1

> 生成：2026-10-07 19:20 · 副参谋
> 前置必读：`dev-docs/STATUS.md`、task-19 交付记录（M10 已本地验证 55/55）
> 前置状态：本地全绿（lint 0/0 · build ✓ · verify 52/52 · CDP 55/55）；线上为 M9-T2（Pages 851631c9）
> 性质：**纯前端部署**（src/** 变更），cron / D1 / secrets 一律不动

---

## 🚀 启动指令

先读 `E:\react\food-nav\dev-docs\STATUS.md`、`E:\react\food-nav\dev-docs\tasks\task-19 - M10 AI 推荐闭环与工作台修复 T1.md`。

任务：**M10 部署上线 + 线上回归**——①本地基线全绿确认（lint 0/0 · verify 52/52 · build ✓）②`npm run build && npx wrangler pages deploy dist --project-name food-nav` ③线上探针 6 项 ④CDP 线上回归（M10 五项新交互 + M1-M9 主功能抽样）⑤按「验收与汇报」出报告 + STATUS.md 更新（线上版本 = M10）。

硬约束：cron / D1 / secrets 零改动；不修改任何源码；回归中不污染线上数据（收藏测完取消、会话测完清理 localStorage）。

---

## 📋 步骤

### 1. 本地基线（快速确认）
```
npm run lint · npm run verify · npm run build
```
任一失败即停，不部署。

### 2. 部署
```
npm run build && npx wrangler pages deploy dist --project-name food-nav
```
验证：输出 deployment URL；上传文件数正常。

### 3. 线上探针（部署后立即）
| 探针 | 期望 |
|---|---|
| `curl -s -o /dev/null -w '%{http_code}' https://food-nav.shiora.cc/` | 200 |
| `curl https://food-nav.shiora.cc/api/health` | `{"ok":true,"data":{"db":"up"}}` |
| `curl -s -o /dev/null -w '%{http_code}' https://food-nav.shiora.cc/ask` | 200（SPA 回退） |
| `curl -s -o /dev/null -w '%{http_code}' https://food-nav.shiora.cc/api/sites?status=active` | 200 |

### 4. CDP 线上回归（新建 `dev-docs/reports/task-20/t20-live.mjs`，参照 t19-accept.mjs 改线上 URL；独立浏览器、每用例隔离 localStorage）
重点断言（M10 新交互，≥20 条）：
1. /ask 工作台渲染（插画/樱见/最近会话面板）
2. **推荐卡主体点击 → 对话流出现追问消息 + AI 流式回答**（含站点名上下文）；角落外链按钮 target=_blank + noopener
3. **对话中「返回工作台」** → 回工作台、会话进最近会话面板、可「继续对话」恢复
4. **最近会话单条删除**（Trash2，storage 同步、删空 → 空态）
5. **路由切换淡入**（route-fade 类名/动画存在，0.18s）
6. **樱花动效**：点击页面 → 花瓣出现 3-5 片、~1s 移除、300ms 限频；点击卡片/按钮功能不受影响
7. 主站回归：卡片/懒加载/搜索/收藏（测完取消还原）/主题/音乐播放器
8. 375 无溢出（主站 + /ask）
9. 暗色：/ask 新交互 token 正常
10. admin 冒烟：登录 → 站点表格 → 热度榜（不写数据）

截图 ≥3 张：01-ask-recommend-ask（线上追问）、02-ask-back-workspace（返回工作台）、03-mobile-375（+可选 04-sakura 动效帧、05-dark）。

### 5. 汇报 + STATUS
- 按 task-19「验收与汇报」格式：部署日志、探针表、回归通过数、截图、遗留
- STATUS.md：线上版本 = M10、部署时间、待部署清零

## 🚫 禁止
- cron / D1 / secrets 零改动（M10 纯前端）
- 不修改源码；不打印密钥；回归污染数据必须还原

## ⚠️ 坑点预警
1. **Pages Functions 即时生效**：探针异常先等 30s 重试
2. **回归脚本污染**：收藏测试必须取消还原；AI 会话测试后清 localStorage（food-nav:ask-history）
3. **CDP 同源**：线上页面同源请求 /api 无 CORS 问题；隐藏窗口节流（反节流参数 + 可见性护栏，参照 t17 经验）
4. **wrangler 登录态**：whoami 未认证先 login
5. **回滚**：异常 → `npx wrangler pages deployment list --project-name food-nav` 回滚上一个部署

## ✅ 验收与汇报
1. 部署日志（deployment URL）
2. 探针表（4 项）
3. 回归通过数 + 清单 10 项逐条 + 截图 ≥3 张
4. STATUS.md 更新（线上 = M10）
5. 遗留问题与风险
