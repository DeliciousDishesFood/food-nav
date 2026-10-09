# task-18 · M9-T2 链接检测分级修正 + 死链复活机制 T1

> 生成：2026-10-07 17:40 · 副参谋（线上问题驱动）
> 前置必读：`dev-docs/STATUS.md`（遗留清单）、task-10/11（M3/M4 检测）、`functions/api/_lib/checker.js`、`functions/api/sites.js`、`functions/api/check/run.js`、`cron/src/index.js`
> 前置状态：线上已部署 M9-T1（verify 52/52）。**线上实测 27 站 5 broken**（豆果/B站=403 误判、Tinrry=TLS 真死、甜品实验室/冰淇淋星球=DNS 真死），主站丢 5 站。

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\dev-docs\STATUS.md`、本任务文档、`E:\react\food-nav\functions\api\_lib\checker.js`、`functions\api\sites.js`、`functions\api\check\run.js`、`cron\src\index.js`、`E:\react\food-nav\dev-docs\reports\task-17\acceptance-log.txt`（线上回归基线）。

任务：**M9-T2 链接检测分级修正**——修复线上 5 站 broken 中 2 个误判（豆果美食 403 / 君之烘焙 B 站 403 均浏览器可开却判死）＋ broken 站自动复活机制缺失（cron 只检 active/checking，判死后永久消失）。核心改动：**有 HTTP 响应的状态码一律视为"可达"（active），只有网络层失败（DNS/TLS/超时）与 404/410/451（页面消失）才判死**；broken 纳入 cron 重测候选（复活机制）。

硬约束：主站前端零改动（`src/**` 不动）；verify 52 保持；m3-api-tests 期望按新分级更新；不自动删除线上站点数据（真死链保留 broken 供管理员治理）；运行时依赖不新增。

---

## 📋 任务清单

### 1. checker.js 状态码语义重分级（核心）

**当前**：403/406/418/502/503/999/520-527/其余5xx → suspicious 档 3 次判死（**错误**：403 有响应 = 站点活着，只是反爬；浏览器用户可访问）。

**改为**：
```
2xx / 3xx（含重定向最终态）      → active（reset，fail_count 清零）
4xx（除 404/410/451 外）         → active（reset）—— 403/401/406/418/429 等有响应 = 可达，
                                    服务器活着，反爬不等于链接失效（note 标注「HTTP xxx，站点可达」）
5xx（含 520-527）                → active（reset）—— 有响应 = 域名/服务在线（note 标注降级）
404 / 410 / 451                  → 确定性失败（increment，连续 2 次判死）—— 页面确实没了
statusCode=0（DNS/TCP/TLS 失败、超时、证书错误）→ 确定性失败（increment + 首败 checking，连续 2 次判死）
```
- `gradeResult` 重写：`isSuspiciousCode` 废弃；失败只两类（页面消失 404/410/451、网络层 0）；其余全 reset
- `SUSPICIOUS_BREAK_AFTER` 常量删除（不再有可疑档）——或保留但无引用，**删除更干净**（oxlint 无未用变量）
- note 文案：403 → `HTTP 403（反爬拦截但站点可达）`；5xx → `HTTP 503（服务降级但站点可达）`
- 注释更新分级说明（M9-T2：有响应 = 可达，只有页面消失/网络不可达才判死）

### 2. broken 站自动复活机制（关键，否则判死即永久消失）

**当前**：`pickTargets` 的 since 路径与默认路径都是 `WHERE status IN ('active','checking')` → broken 永不进 cron 候选。

**改为**：
- since 路径与默认路径：`status IN ('active','checking','broken')`（全量检测含 broken，预算内多轮收敛；M3 实测全量 27 站多轮 <5s）
- 排序 `last_checked_at` 最久未检优先不变（broken 也会被挑到重测）
- 效果：broken 站下次 cron/手动全量检测会重测，一旦网络层恢复（DNS/TLS 修复）→ 自动复活 active
- 手动单站检测路径（siteIds）本就不过滤 status，不动

### 3. 主站显示策略（sites.js）

- **保持现状**：`/api/sites` 默认 `status='active'`（checker 修好后 broken 只剩真死链，隐藏正确）
- 不改为 `IN ('active','checking')`（保持简单；checking 现在只出现在网络层首败的过渡态，几小时内自动恢复）

### 4. 真死链治理（不自动删，说明即可）

- Tinrry（TLS 证书过期）/ 甜品实验室（DNS 死）/ 冰淇淋星球（DNS 死）：**保留 broken**（主站已隐藏，后台可见）
- 任务完成汇报中说明：这 3 站是真实死链，管理员可在 admin 删除或改 URL（**OpenCode 不代删线上数据**）

### 5. m3-api-tests 期望更新 + 新增分级单测

- `m3-api-tests`（或对应检测测试脚本）中 403 相关 2 条过期期望：403 → **active**（不再 checking/broken）
- 新增分级单测（纯函数，可放 m3-api-tests 或独立 `t18-grade.mjs`）：覆盖
  - `403` → active、fail_count 清零
  - `404` → increment、连续 2 次 broken
  - `503` → active（有响应）
  - `statusCode=0 + timedOut` → increment + checking、2 次 broken
  - `statusCode=0 + DNS/TLS 错误` → 同上
  - `429` → keep（fail_count 不变，状态不变）
- verify.mjs **保持 52 不动**（前端语义无变化）

### 6. 部署（本任务必须部署——线上问题修复）

```
npx wrangler deploy --config cron/wrangler.toml      # checker 在 cron Worker 里，必须重部署
npm run build && npx wrangler pages deploy dist --project-name food-nav   # sites.js 若未改可不重部署，但统一部署更稳
```
- 部署后**手动触发一次线上全量检测**：`POST /api/check/run {batch:4}`（需 admin token）或等下次 cron（北京 12:00）
- 验证：豆果美食/B站 → active 恢复；Tinrry/甜品实验室/冰淇淋星球 → 保持 broken（真死）

---

## 🚫 禁止
- 主站 `src/**`、前端组件零改动
- 不自动删除/修改线上站点数据（真死链留给管理员）
- 不打印 FAVORITE_SALT / ADMIN_SECRET 等密钥
- verify.mjs 52 条不动；不新增运行时依赖

## ⚠️ 坑点预警
1. **cron 必须重部署**（checker.js 是 cron Worker 的代码，只部署 Pages 不生效）——部署顺序：cron 先、Pages 后
2. **gradeResult 重写后**：`SUSPICIOUS_CODES`/`isSuspiciousCode`/`SUSPICIOUS_BREAK_AFTER` 全部清理，防 oxlint no-unused-vars；`DETERMINISTIC_CODES`（404/410/451）保留
3. **broken 纳入候选后**：全量检测多 3 站（22 active + 5 broken = 27），预算 18s/轮、并发 4、多轮收敛——确认 remaining 能归 0（M3 实测 23 站 3 轮 3.9s，27 站无压力）
4. **复活条件**：broken 站重测时网络层恢复才复活（如 dessertlab 若 DNS 恢复）；403 → active 是立即的（豆果/B站下次检测即恢复）
5. **m3-api-tests 更新范围**：只改 403 期望为新语义，其他断言（404/超时/429/锁/日志/分页）不动
6. **PowerShell 写中文文件损坏 UTF-8** → 源码只用编辑器工具改

## ✅ 验收与汇报

### 验证命令
```
npm run lint · npm run build · npm run verify   # verify 52/52 保持
node t18-grade.mjs（或 m3-api-tests）            # 分级单测全绿
```

### 手动验证清单（逐项 ✓/✗）
1. 分级单测：403/5xx → active；404/网络层 0 → 判死；429 → keep（如上 6 组）
2. 本地 pages dev：`/api/check/run {siteId:2}`（豆果）→ active；`{siteId:8}`（Tinrry）→ broken（TLS 真死）；`{siteId:9}`（dessertlab）→ broken（DNS 真死）
3. broken 复活机制：本地把某站手动置 broken 后跑全量检测 → 该站被重测（在 candidates 内）
4. 部署后线上：全量检测一次 → 主站恢复 24 active（豆果/B站回来、3 真死链隐藏）
5. 主站回归：首页 24 站卡片齐全、无降级条、收藏/搜索/主题正常
6. verify 52/52 · lint 0/0 · build ✓
7. 375 无溢出

### 汇报格式
1. 改动清单（checker.js 分级重写 + pickTargets + m3-api-tests 更新）
2. 验证结果（命令输出 + 分级单测 6 组 + 清单 7 项逐条）
3. 截图：线上主站恢复 24 站（含豆果/B站）+ 检测日志/check_logs 证据（broken→active 行）
4. 部署状态：cron 重部署 + Pages 部署记录；部署后线上全量检测结果
5. 遗留问题与风险（3 真死链待管理员治理、防重锁仍为内存锁等）
