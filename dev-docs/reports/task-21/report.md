# task-21 · M9-T3 检测豁免机制与死链治理 · 验收报告

> 时间：2026-10-08 · base https://food-nav.shiora.cc · 线上版本 = M10 + M9-T3
> 结论：**全绿** —— lint 0/0 · verify **52/52** · build ✓ · 单测 **36/36** · 本地 **16/16** · 线上 API **25/25** · 线上 CDP **26/26**；线上 27 站全 active，豁免站 1 个（id 8）。

---

## 1. 改动清单

| 文件 | 改动 |
|---|---|
| `schema/migrations/006-skip-check.sql`（新建） | `ALTER TABLE sites ADD COLUMN skip_check INTEGER NOT NULL DEFAULT 0`（**schema 一次性**）+ 数据段幂等：级联删 id 9/10（favorites→site_stats→check_logs→sites）→ 插 id 29 美食天下 / 30 好豆网（tag 空、status active）→ site_stats 行 → `UPDATE id 8 SET skip_check=1, status='active', fail_count=0`（带 `AND (skip_check IS NOT 1 OR status<>'active' ...)` 条件防重复变更） |
| `functions/api/_lib/checker.js` | 文件头补 M9-T3 豁免说明；`pickTargets` **三条路径**（siteIds / since / 默认）均加 `AND skip_check = 0`；新增导出 `skippedSiteIds(db, siteIds)` |
| `functions/api/check/run.js` | 取锁前查豁免：全命中 → 返回 `{skipped:true, skippedIds:[…], total:0}`；未命中的站点才走检测，否则附 `summary.skippedIds` |
| `functions/api/_lib/db.js` | `SITE_COLUMNS` 加 `s.skip_check`；`toSiteDto` 输出 `skipCheck: !!row.skip_check`；`SITE_FIELD_COLUMNS` / `createSite` 支持 `skipCheck→skip_check`（缺省 0） |
| `functions/api/_lib/validate.js` | `skipCheck` 归一为 0/1（仅 boolean / 0 / 1，否则「skipCheck 只能是布尔值」） |
| `src/admin/AdminSiteForm.jsx` | 新增 state + 表单底部「跳过自动检测」checkbox（`aria-label="跳过自动检测"`）+ 说明文案（cron / 手动全量 / 单站检测均不参与）；编辑回显 `initial.skipCheck`；payload 带 `skipCheck` |
| `src/admin/AdminSites.jsx` | 状态列「豁免」徽标（bg-food-sun）；`handleCheck` 命中 `payload.data.skipped` → 提示「「××」已设置「跳过自动检测」，本次不参与检测」 |
| `dev-docs/reports/task-21/` | 验收脚本 `t21-skip.mjs`（单测）/ `t21-local.mjs` / `t21-online.mjs` / `t21-live.mjs`（CDP + 截图）+ 全部日志与部署证据 |

**红线**：`src/components/**`、`src/pages/**`、`index.css`、`tailwind.config.js`、`vite.config.js`、`navSources.js`、`tests/verify.mjs` 零改动（今日仅 functions/ · schema/ · src/admin/ · dev-docs/ 有 mtime）；零新运行时依赖；新站未打标（tag=''）。

**id 顺延说明**：任务卡原话「显式 id 28/29」，但执行前 `SELECT COALESCE(MAX(id),0)` 线上为 **28**（M10 期间的重复站 benlai.com，不可删）→ 按任务卡「冲突则顺延」改用 **29 / 30**。

## 2. 验证结果

### 命令基线
```
npm run lint     → 0 警告 0 错误（lint.txt）
npm run verify   → RESULT: 52 passed / 0 failed（verify.txt）
npm run build    → ✓ built in 1.02s，index-B04rCPou.js 309.67 kB（build.txt）
node t21-skip.mjs   → RESULT: 36 passed / 0 failed（skip-test-log.txt）
node t21-local.mjs  → RESULT: 16 passed / 0 failed（local-checks.txt，pages dev 127.0.0.1:8788）
node t21-online.mjs → RESULT: 25 passed / 0 failed（online-checks.txt）
node t21-live.mjs   → RESULT: 26 passed / 0 failed（live-checks.txt）
```
- verify 52 **语义保持**：未改 `tests/verify.mjs`；admin 场景不断言表单 payload，23 卡片来自 navSource mock，mock 未动 → 52/52 直接通过（无需演进）。
- 本地 D1 有历史测试夹具（39 行），本地验收按「豁免排除 / DTO / 单站跳过」口径断言，不以 27 行为准；线上以 27 站为口径。

### 手动清单（8/8 ✓）
1. **migration 006 幂等**：本地 2 次执行无错；远程重跑**数据段** `IDENTICAL=true ROWS=27`（migration-006-remote-rerun.txt），**整文件**重跑在首句 `ALTER TABLE` 报 `duplicate column name: skip_check` exit 1、**数据零变更**（migration-006-remote-rerun-full.txt）→ **schema 段一次性，数据段幂等**（执行日志已留证）。
2. **checker 豁免**：全量首轮 `total=26`（27-1）、id 8 从未进候选/结果；单站 id 8 → `{skipped:true, skippedIds:[8], total:0}` 且 `lastCheckedAt` 不变。
3. **admin**：编辑 tinrry → checkbox 已勾选回显 + 文案含 cron/单站检测；新增表单 checkbox 存在且**默认未勾选**；站点表 tinrry 行「豁免」徽标（01a 截图）；点「检测」→ 跳过提示文案（CDP P5 ✓）。
4. **新站**：29 美食天下 HEAD/GET **403**（反爬拦截但站点可达 → 新分级判 active）、30 好豆网 **200 → active**；主站两站卡片描述正确、无破图（02 整页截图）。
5. **主站**：27 卡片全渲染（懒加载逐帧滚动 `food-card nodes=27`）、含 Tinrry/美食天下/好豆网、不含已删 9/10、无降级条；375 无横向溢出；主题亮色还原。
6. **线上**：`/api/sites?status=active` **27**、`status=all` **27（0 broken / 0 checking）**、tinrry `active + skipCheck=true + failCount=0`；`skip=[8]`；`dead910=0`（最终复核脚本输出）。
7. **lint 0/0 · verify 52/52 · build ✓**。
8. **375 无溢出**（03 截图）；**暗色 admin 徽标/表格正常**（04 截图）。

### 截图（6 张，均已过像素探针 / 人工抽查）
| 文件 | 内容 |
|---|---|
| `01-admin-skip-check.png` | 编辑 tinrry 表单：「跳过自动检测」已勾选 + 说明文案 + 保存/取消（探针 = 保存按钮主色） |
| `01a-admin-skip-badge.png` | 站点表 tinrry 行「正常 + 豁免」徽标（探针 = 徽标 bg-food-sun） |
| `02-home-27-sites.png` | 主站首屏（探针 = 「全部」pill 主色） |
| `02-home-27-sites-full.png` | **整页 27 卡片**证据图（5 分类：家常 5 / 烘焙 5 / 外卖 4 / 茶饮 7 / 生鲜 6） |
| `03-mobile-375.png` | 375 视口，2 列卡片、无溢出（探针过） |
| `04-admin-dark-badge.png` | 暗色 admin 站点表 + 豁免徽标（探针过） |

## 3. 部署状态（三步全过）
| 步骤 | 证据 | 结果 |
|---|---|---|
| ① D1 migration 006（remote） | `migration-006-remote.txt` | exit 0，`rows_written: 35`；执行后核验 total=27 active=27、id8 skip=1、29/30 在库 tag 空、9/10 已删、site_stats(29,30)=2 行、check_logs(9,10)=0 |
| ② 数据段幂等重跑 | `migration-006-remote-rerun.txt` | exit 0，快照 `IDENTICAL=true ROWS=27`；整文件重跑 exit 1（duplicate column，schema 一次性） |
| ③ cron Worker 重部署 | `deploy-cron.txt` | `Current Version ID: b80cb8d5-76b9-4c3a-ba57-57ba52215557`（`food-nav-link-check-cron`，schedule `0 4 * * *`） |
| ④ Pages 部署 | `build.txt` + `deploy-pages.txt` | deployment **`c1bed251.food-nav-5eb.pages.dev`**（5 个新文件上传，14 复用） |

线上复核（最终）：`total=27 {"active":27} skip=[8] dead910=0`。

## 4. 遗留问题与风险
1. **`CHECK_TIMEOUT_MS=5000` 边缘超时误判**（M9 已知问题 #10，**本任务未改，超范围**）：全量检测时星巴克中国(id16) 曾连续 5 次超时被判 broken、蜜雪冰城(id19) 一次超时 → 均在补检后恢复 active（本次线上最终 27 active）。如需降低误判，后续任务把超时提到 8000ms 或按域名单独放量。
2. **meishichina 403**：边缘 IP 被反爬拦截 → 新分级按「浏览器可达」判 active；若未来被彻底阻断会走网络层判死，届时由管理员决定是否豁免（不自动打标/豁免）。
3. **migration 006 不可整文件重跑**（首句 ALTER 报 duplicate column，exit 1、数据零变更）；后续迁移需沿用「schema 一次性 + 数据幂等」的写法，或在迁移前用 `PRAGMA table_info` 判断。
4. **CDP 脚本首轮 2 个 FAIL 为脚本时序抖动**（P5/P6 轮询窗口过短 + P7 暗色导航后未重新进入站点管理页），加诊断与逐帧滚动后重跑 **26/0 全绿**，非产品缺陷。
5. 本地 Edge CDP 调试窗口（`--remote-debugging-port=9222`，PID 35104）已用于截图验收，交付后可关闭。
