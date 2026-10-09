# task-22 · M9 收尾工程打包 T1

> 生成：2026-10-09 22:10 · 副参谋（M9 最后 4 个剩余子项，一次清完 M9 彻底关闭）
> 前置必读：`dev-docs/STATUS.md`、task-18/21（M9-T2/T3）、`functions/api/_lib/checker.js`、`functions/api/check/run.js`、`cron/src/index.js`、`functions/api/_lib/response.js`、`src/components/NavCard/NavCard.jsx`、`src/components/CoverPlaceholder.jsx`
> 前置状态：线上 M10 + M9-T3，27 站全 active，verify 52/52

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\dev-docs\STATUS.md`、本任务文档、`E:\react\food-nav\functions\api\_lib\checker.js`、`functions\api\check\run.js`、`cron\src\index.js`、`functions\api\_lib\response.js`、`src\components\NavCard\NavCard.jsx`、`src\components\CoverPlaceholder.jsx`、`schema\migrations\001-init.sql`（幂等写法参考）。

任务：**M9 收尾工程打包（4 子项）**——①封面破图兜底（NavCard 封面 img onError → 复用 CoverPlaceholder）②严格 404（/api/ 未匹配路由 catch-all 返回 404 信封）③瞬时超时优化（CHECK_TIMEOUT_MS 5000→8000）④检测防重锁升级（内存锁 → D1 锁）。完成后 M9 全部关闭。

硬约束：**主站组件红线例外**——本任务唯一允许改动 `src/components/NavCard/NavCard.jsx` 的封面渲染处（~6 行），其余组件/页面/样式零改动；verify 52 语义保持（先 grep 是否有 NavCard img/cover 相关断言，有则演进并说明）；零新运行时依赖。

---

## 📋 任务清单

### 1. 封面破图兜底（红线例外：仅 NavCard.jsx 封面处）

**现状**：`NavCard.jsx:57-66` `coverImg ? <img src={coverImg}> : <CoverPlaceholder />`——URL 封面外链失效时显示破图（favicon 模式后端有占位，URL 封面无）。

**改为**（最小 diff，~6 行）：
- NavCard 引入 `useState`，封面区改为：
  ```
  const [coverFailed, setCoverFailed] = useState(false)
  // 渲染：
  coverImg && !coverFailed
    ? <img src={coverImg} onError={() => setCoverFailed(true)} ...原有 class 保留 />
    : <CoverPlaceholder />
  ```
- onError 一次触发（coverFailed 置 true 后不再渲染 img，天然防循环）
- 原有布局/尺寸/过渡动画 class 逐字保留，只加状态切换
- **除 NavCard.jsx 封面 6 行外，src/components/** 其它文件零改动**

### 2. 严格 404（catch-all）

**现状**：未定义路由（/api/_lib/db、/api/categories/1、/api/abc）回落 SPA index.html（返回 200 HTML），不泄露数据但语义错误。

**改为**：
- 新建 `functions/api/[[path]].js`（Pages Functions catch-all 语法）：onRequest 返回 404 JSON 信封
  `{ ok: false, error: { code: 'not_found', message: 'Not Found' } }`（复用 `response.js` 的 json 工具，Content-Type: application/json，状态 404）
- 位置：`functions/api/[[path]].js` 只匹配 /api/ 下未命中的路径；已定义路由（health/categories/sites/favorites/stats/track/check/ai 等）优先级更高不受影响；静态资源（/assets /covers /icons）不在 /api/ 下不受影响
- 同时检查 `/api/` 根路径（无子路径）行为：现在应 404 或 200？——统一 catch-all 处理为 404（除非已有 /api/ 路由，确认后决定）

### 3. 瞬时超时优化

**现状**：`CHECK_TIMEOUT_MS = 5000`，边缘慢站偶发超时误判（task-21 时 id16/id19 实例）。

**改为**：
- `CHECK_TIMEOUT_MS = 8000`（注释更新：边缘慢站留足响应时间，降低误判）
- 检查预算联动：单站最坏 HEAD+GET = 16s < `DEFAULT_TIME_BUDGET_MS`(18s) 仍成立；若 18s 下多轮收敛变慢属正常（remaining 机制），全量验证 remaining 能归 0
- 其它常量/逻辑不动

### 4. 检测防重锁升级（D1 锁）

**现状**：`tryAcquireCheckLock()`/`releaseCheckLock()` 用 globalThis 内存锁（60s TTL），跨 isolate 不互斥——cron Worker 与手动 /api/check/run 可能并发双跑。

**改为**：
- **migration 007-check-lock.sql**（幂等）：
  ```sql
  CREATE TABLE IF NOT EXISTS check_lock (
    key TEXT PRIMARY KEY,
    until INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```
- `checker.js`：
  - `tryAcquireCheckLock(db)` → D1 原子拿锁：
    ```sql
    INSERT INTO check_lock (key, until, updated_at) VALUES ('check', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET until = excluded.until, updated_at = datetime('now')
    WHERE check_lock.until < ?
    ```
    带 RETURNING 判断受影响行数（0 行 = 有活跃锁 → false）；参数 now+TTL(60s) 与 now
  - `releaseCheckLock(db)` → `DELETE FROM check_lock WHERE key = 'check'`
  - 注释更新（M9-T4：D1 锁，跨 isolate 互斥）
- `check/run.js`：调用点传 db（`tryAcquireCheckLock(db)` / `releaseCheckLock(db)`）
- `cron/src/index.js`：确认锁调用——若 cron 未加锁，**补上**（与手动检测跨实例互斥）；传 db
- 锁 TTL 60s 不变；错误兜底：D1 异常时**放行**（不因锁故障阻塞检测）

---

## 🚫 禁止
- src/components/** 除 NavCard.jsx 封面 6 行外零改动；src/pages/**、index.css、tailwind.config.js、vite.config.js、navSources.js 零改动
- verify 52 语义破坏；零新运行时依赖；不打印密钥
- 不改 `resolveStatus`/`gradeResult`/`pickTargets` 分级逻辑（豁免机制 M9-T3 已定型，本任务只动超时与锁）

## ⚠️ 坑点预警
1. **NavCard 改动最小化**：只加 useState + 条件切换；diff 控制在 6 行左右；hover 形变/过渡/布局零变化；grep verify.mjs 是否断言卡片 img/封面（有则演进说明）
2. **catch-all 语法**：Pages Functions 双括号 `[[path]].js` 是 catch-all（单括号 `[path]` 是单段）——确认用 `[[path]]`；写入后 curl 验证：/api/abc → 404、/api/health → 200、/ → 200、/assets/*.js → 200（静态不误伤）
3. **D1 锁原子性**：ON CONFLICT DO UPDATE ... WHERE until < ? + RETURNING 是拿锁判定核心；本地用两个并发请求实测（第二个 → 429 check_in_progress）；异常放行兜底
4. **cron 与手动并发**：部署后手动跑 /api/check/run 同时等 cron 触发（北京 12:00）观察无双跑；本地可模拟（pages dev + 独立 node 调 runChecks）
5. **超时 8s 回归**：全量检测 remaining 归 0 验证；慢站（星巴克/蜜雪等）不再连续超时误判
6. **部署顺序**：migration 007 远程 → cron 重部署（checker 改了）→ build + pages deploy（catch-all + NavCard 改动）
7. **PowerShell 写中文文件损坏 UTF-8** → 源码用编辑器工具改

## ✅ 验收与汇报

### 验证命令
```
npm run lint · npm run build · npm run verify      # verify 52（或演进后，说明）
npx wrangler d1 execute food-nav-db --local --file schema/migrations/007-check-lock.sql   # 幂等
```

### 手动验证清单（逐项 ✓/✗）
1. 封面兜底：本地 D1 给某站设失效外链封面（如 https://example.com/broken.png）→ 主站该卡显示 CoverPlaceholder 占位、不破图、布局无跳动（截图）；恢复原封面正常显示
2. 严格 404：`/api/abc`、`/api/categories/1`、`/api/_lib/db` → 404 信封；`/api/health` 200；`/` 200；`/assets/*.js`、`/covers/noodle.svg` 200（静态不误伤）
3. 超时 8s：单站检测慢站正常；全量检测 remaining 归 0、无连续超时误判
4. D1 锁：本地并发两次 /api/check/run → 第二个 429 check_in_progress；释放后可再跑；锁表无残留行
5. 回归：主站 27 站全显示、搜索/分类/收藏/主题/打字机/音乐播放器正常；AI 樱见工作台/推荐闭环正常；admin 登录/豁免开关/徽标正常
6. verify 52（或演进后）· lint 0/0 · build ✓
7. 375 无溢出（主站 + 封面兜底态）；暗色正常
8. 部署后线上：catch-all 404 生效、健康检查正常、27 active

### 汇报格式
1. 改动清单（4 子项文件级）
2. 验证结果（命令输出 + 清单 8 项逐条）
3. 截图 ≥3 张：01-cover-fallback（破图→占位对比）、02-api-404（curl 信封）、03-mobile-375（+可选 04-dark）
4. 部署状态：migration 007 远程 + cron 重部署 + pages deploy 记录；线上 404/锁/超时验证
5. 遗留问题与风险（M9 全关后项目整体遗留状态一句话）
