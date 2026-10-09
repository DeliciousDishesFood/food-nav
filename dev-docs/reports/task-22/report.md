# task-22 · M9 收尾工程打包 T1 · 验收报告

> 时间：2026-10-09 · base https://food-nav.shiora.cc · 线上版本 = M10 + M9-T3 + **M9-T4（本任务）**
> 结论：**全绿** —— lint 0/0 · verify **52/52**（语义保持，未改 verify.mjs）· build ✓ · 本地 D1 锁并发 **429** · 本地全量 remaining=0 · 线上全量 remaining=0 · 线上 27 站全 active · catch-all 404 全路径验证通过。**M9 全部关闭。**

---

## 1. 改动清单（4 子项 · 文件级）

| 子项 | 文件 | 改动 |
|---|---|---|
| ① 封面破图兜底 | `src/components/NavCard/NavCard.jsx`（**红线例外，唯一主站组件改动**，+4/-1） | `import { useState }`；`const [coverFailed, setCoverFailed] = useState(false)`；封面条件 `coverImg` → `coverImg && !coverFailed`；img 加 `onError={() => setCoverFailed(true)}`。布局/尺寸/过渡动画 class 逐字保留；onError 一次触发后不再渲染 img，天然防循环 |
| ② 严格 404 catch-all | `functions/api/[[path]].js`（新建） | Pages Functions catch-all：`onRequest` → `fail('not_found', 'Not Found', request, 404)`（复用 response.js 信封）。已定义路由优先级更高不受影响；静态资源不在 /api/ 下不受影响；`/api/` 根路径也 404 |
| ③ 超时 5s→8s | `functions/api/_lib/checker.js` | `CHECK_TIMEOUT_MS = 8000`；注释更新：最坏 HEAD+GET 16s < `DEFAULT_TIME_BUDGET_MS`(18s) 仍成立；其余常量/逻辑不动 |
| ④ D1 原子锁 | `schema/migrations/007-check-lock.sql`（新建）· `functions/api/_lib/checker.js` · `functions/api/check/run.js` · `cron/src/index.js` | 见下方详表 |

### ④ 详表

| 文件 | 改动 |
|---|---|
| `schema/migrations/007-check-lock.sql`（新建） | `CREATE TABLE IF NOT EXISTS check_lock (key TEXT PRIMARY KEY, until INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))` —— 幂等，可重复执行 |
| `functions/api/_lib/checker.js` | `tryAcquireCheckLock(db)` → D1 原子拿锁：`INSERT … VALUES ('check', now+TTL, …) ON CONFLICT(key) DO UPDATE SET until=excluded.until … WHERE check_lock.until < now RETURNING until`；0 行 = 有活跃锁 → false，≥1 行 = 拿锁成功 → true；**D1 异常时放行**（`catch { return true }`，不因锁故障阻塞检测）。`releaseCheckLock(db)` → `DELETE FROM check_lock WHERE key='check'`（异常吞掉，TTL 60s 过期兜底）。删 globalThis 内存锁。TTL 60s 不变。注释更新（M9-T4 D1 锁跨 isolate 互斥） |
| `functions/api/check/run.js` | 调用点改 `await tryAcquireCheckLock(db)` / `await releaseCheckLock(db)`；注释更新 |
| `cron/src/index.js` | **补锁**（原 cron 未加锁）：`scheduled` 开头 `if (!(await tryAcquireCheckLock(db)))` → 跳过本次 cron 并 log `{skipped:'check_in_progress'}`；检测循环包在 `try/finally` 中 `await releaseCheckLock(db)`。与手动 /api/check/run 跨实例互斥 |

**红线**：`src/components/**` 除 NavCard 封面 6 行外零改动；`src/pages/**`、`index.css`、`tailwind.config.js`、`vite.config.js`、`navSources.js`、`tests/verify.mjs` 零改动；零新运行时依赖；不改 `resolveStatus`/`gradeResult`/`pickTargets` 分级逻辑。

**verify 52 语义保持说明**：`grep tests/verify.mjs` 无卡片 img/cover/NavCard 断言（仅 mock 数据字段 `coverImg`）→ 未改 verify.mjs，52/52 直接通过。

## 2. 验证结果

### 命令基线
```
npm run lint   → 0 警告 0 错误（lint.txt）
npm run verify → RESULT: 52 passed / 0 failed（verify.txt）
npm run build  → ✓ built in 1.01s，index-C-xHdVPZ.js 309.71 kB
npx wrangler d1 execute food-nav-db --local --file schema/migrations/007-check-lock.sql  → ×2 成功（幂等）
npx wrangler d1 execute food-nav-db --remote --file schema/migrations/007-check-lock.sql → rows_written:3；重跑 rows_written:0（幂等确认）
```

### 手动清单（8/8 ✓）
1. **封面兜底**：本地 D1 将 id 1 下厨房 cover_img 设为 `https://example.com/broken-cover.png` → 主站首卡显示 CoverPlaceholder 占位插画、无 img、无破图、布局无跳动（01 截图）；恢复 `/covers/noodle.svg` 后正常显示 img（01a 截图）。CDP 断言 `broken cover → CoverPlaceholder (no broken img)` ✓
2. **严格 404**：本地 pages dev：`/api/abc` · `/api/_lib/db` · `/api/categories/1`（无 GET handler → catch-all）· `/api/` 根 → 全部 404 信封 `{"ok":false,"error":{"code":"not_found","message":"Not Found"}}`；`/api/health` 200 · `/` 200 · `/covers/noodle.svg` 200（静态不误伤）。线上（部署后）：`/api/abc` 404 · `/api/categories/1` 404 · `/api/_lib/db` 404 · `/` 200 · `/assets/index-C-xHdVPZ.js` 200 · `/covers/noodle.svg` 200 · `/api/health` 200 db:up（online-404.txt / online-health.txt）
3. **超时 8s**：本地全量 since 循环 4 轮 **remaining=0**（checked 10+10+10+8=38，本地含 M3 测试夹具站）；线上全量 since 循环 4 轮 **remaining=0**（checked 10+10+10+1=31 = 27 站 + 并发补跑窗口内新候选，active 30 / broken 0 / checking 0 / errors 0）；星巴克 id16 GET 206 正常 active，无连续超时误判
4. **D1 锁**：本地 pages dev 并发两次 POST /api/check/run → 第二个 **429 check_in_progress**，第一个 200；释放后再跑 200；锁表无残留行（SELECT check_lock = 0 rows）。线上全量结束后单站补跑 200 ok=true（锁已释放）
5. **回归**：主站 27 站全显示（线上 active=27 skip=[8]）；搜索/分类/收藏/主题/打字机/音乐播放器 verify 覆盖 ✓；AI/ admin 本次未动（纯后端 + NavCard 6 行，零新依赖）
6. **verify 52 · lint 0/0 · build ✓**
7. **375 无溢出**（03 截图，封面兜底态 `documentElement.scrollWidth <= innerWidth` ✓）
8. **部署后线上**：catch-all 404 生效 · health 200 · 27 active

### 截图（4 张，`dev-docs/reports/task-22/`）

| 文件 | 内容 |
|---|---|
| `01-cover-fallback-broken.png` | 封面兜底：失效外链 → CoverPlaceholder 占位（无破图） |
| `01a-cover-normal.png` | 恢复原封面正常显示 img（对比） |
| `02-api-404-envelope.png` | `/api/abc` → 404 JSON 信封 |
| `03-mobile-375-cover-fallback.png` | 375 封面兜底态，无横向溢出 |

## 3. 部署状态

| 步骤 | 结果 |
|---|---|
| ① migration 007 远程 | `wrangler d1 execute food-nav-db --remote --file schema/migrations/007-check-lock.sql` → exit 0 `rows_written:3`；重跑 `rows_written:0`（幂等） |
| ② cron 重部署 | `npx wrangler deploy --config cron/wrangler.toml` → **version `79b39a46-b8ee-45ad-bed6-dcc8104be605`**（`0 4 * * *`，checker.js 改动必须先于 Pages） |
| ③ build + pages deploy | `npm run build && npx wrangler pages deploy dist --project-name food-nav` → **deployment `625437fb.food-nav-5eb.pages.dev`**（Production/main，19 文件，4 新传 + 15 复用） |
| 线上验证 | `/api/abc` 404 信封 ✓ · `/api/health` db:up ✓ · `/api/sites?status=active` 27 ✓ · 全量检测 4 轮 remaining=0 ✓ · 锁释放后单站 200 ✓ |

**回滚**：`npx wrangler pages deployment list --project-name food-nav` 回 `c1bed251`（M9-T3）；cron 回 `b80cb8d5`；D1 007 为纯增量表，可留不删。

## 4. 遗留问题与风险

- **M9 全部关闭**（T1 收藏服务端化 / T2 分级修正 / T3 豁免机制 / T4 本任务 4 子项）。
- **项目整体遗留一句话**：M10 后续候选 = 热度衰减公式；tinrry/dessertlab/icecreamplanet 3 真死链由管理员按需处理；缓存/限频/secret 值等常规运维项不变。
- **D1 锁 TTL 60s**：若检测轮次超过 60s 理论上可被二次拿锁——当前 cron 多轮每轮独立拿锁+释放，手动单轮 timeBudget 18s + 最坏 16s < 60s，安全余量充足。
- **本地 pages dev 与 cron 是两个独立 miniflare D1**：本地 cron 测试需在 `cron/.wrangler` 单独迁移 007；线上无此问题。
