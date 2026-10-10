# task-24 · 3D 樱花背景（three.js）+ 签卡去摇签 · 验收报告

> 时间：2026-10-10 · 纯前端任务，**默认不部署**（线上版本不变 = M10 + M9-T3 + M9-T4）
> 结论：**全绿** —— lint **0/0** · verify **54/54** · build ✓（three 拆独立 chunk，未进首屏）· 本地 CDP 手动清单 **22/22** · 截图 3 张。

---

## 1. 改动清单

| 文件 | 改动 |
|---|---|
| `src/components/DailyFortune/DailyFortune.jsx`（重写） | **去掉摇签换签**：删 `SHAKE_MS` / `randomPick` / `rolled` / `shaking` / `rollCount` / `useEffect` / `useRef` / `onClick` / `onKeyDown` / `role` / `tabIndex` / `cursor-pointer` /「摇一摇换签」提示 / `key={rollCount}`；**保留**日期种子每日推荐签文（同日一致）、`target="_blank" rel="noopener noreferrer"` 站点直达链接、4 模板池、groups 空 render null、全 token 暗色适配；仅留极淡 hover → 纯静态展示卡 |
| `src/components/DailyFortune/fortune.css`（**删除**） | 全文件删除（`@keyframes fortune-shake` 摇晃动画所在），已无引用 |
| `src/components/effects/Sakura3DBackground.jsx`（**新建**，320 行） | 3D 樱花背景：① `detectRuntime()` 惰性 `useState`（`window.WebGLRenderingContext` → `prefers-reduced-motion` → canvas 探测 WebGL 上下文 + `WEBGL_lose_context` 释放）任一不过 → `return null`；② effect 内 **`await import('three')`**（严禁顶部静态 import）+ `startScene()` 双层 try/catch 静默降级；③ 40 片（`matchMedia <768px` = 15 片）`PlaneGeometry(0.12~0.2)` 随机尺寸 + `MeshBasicMaterial({ color: 0xffb6cd 系 4 色, transparent, opacity 0.65, side: DoubleSide, depthWrite:false })` + canvas 单瓣贴图（樱花缺口）；④ 下落 0.3~0.8/s（delta time）+ x 正弦风场 + rotation.x/z 翻转 + `y<-5` 回收重生；⑤ 鼠标 `mousemove → targetX/Y = ±0.3`，逐帧 lerp（`z∈[-2,2]` 近快远慢）；⑥ `visibilitychange` hidden 暂停 / resize 同步相机与画布 / 卸载 dispose 全量（geometry/material/texture/renderer + 移除 canvas + 删钩子）；⑦ `renderer.info.autoReset=false` + tick 内 `info.reset()`（供 CDP 读当帧绘制量）；⑧ 钩子 `host.__sakura3d = { camera, renderer, count, scene, petals }`（只读，取证用）；容器 `fixed inset-0 z-0 pointer-events-none` + `aria-hidden` |
| `src/App.jsx` | 仅新增 import + **`<Sakura3DBackground />` 渲染在 `.route-fade` 容器之前**（带层级注释）——见踩坑①；`<SakuraBurst />` 与其并列保留 |
| `package.json` | **+1 运行时依赖 `three@^0.186.1`**（任务卡核心要求，动态 import 保证不进首屏 chunk） |
| `tests/verify.mjs` | **零改动**（54 断言语义保持：签卡只有 `home shows daily fortune card` 存在性断言，无「点击换签」断言） |

**红线合规**（`git status --short` 可证）：`NavCard/**`、`Layout/**`、`MusicPlayer/**`、`TypeWriterQuote.tsx`、主站 `Header.jsx` **零改动**；`src/components/**` 只新增 `effects/Sakura3DBackground.jsx`；SakuraBurst（2D 点击溅花瓣）保留；ask 流式逻辑逐行未动；`index.css` / `tailwind.config.js` 既有 token 只复用未修改；无后端/数据库改动。**例外**：STATUS 红线「运行时依赖不新增」——`three` 由任务卡明文要求（§任务 2），按任务卡口径豁免。

## 2. 命令基线（输出见同目录 txt）

```
npm run lint   → 0 警告 0 错误（lint.txt）
npm run verify → RESULT: 54 passed / 0 failed（verify.txt，未改 verify.mjs）
npm run build  → ✓ built in 970ms（build.txt）
  dist/assets/index-B1k8sDU0.js        315.63 kB │ gzip: 102.01 kB   ← 首屏（+组件本身，基线 task-23 312.31/100.51）
  dist/assets/three.module-4gI5Z-_B.js 736.58 kB │ gzip: 186.86 kB   ← three 独立 chunk（>500kB 警告属预期）
```
首屏 index chunk 内仅 **使用点**（`WebGLRenderer`/`PerspectiveCamera`/`PlaneGeometry` 各 1 次 = 组件调用），three 实现体全部在独立 chunk；运行时证据见手动清单 1（`performance.resource` 显示 `three.module-*.js` 在导航完成后才拉取）。

## 3. 手动清单（CDP `t24-accept.mjs` → **22 passed / 0 failed**，accept-log.txt）

| # | 清单项 | 结果 |
|---|---|---|
| 1 | 首页 3D 花瓣飘落（翻转/摆动/有层次，不抢卡片视觉） | ✓ `sakura3d-layer` = `fixed / inset-0 / z-index:0 / pointer-events:none` + canvas；`scene.children === 40` 且 `petals.length === 40`；`tris === 2×calls`、`calls ≥ 20 且 ≤ 2×count`；`geo` 10→40 随花瓣入画增长（视锥剔除）；`frame` 600ms 内递增；**three 按需懒加载**（资源 startTime ≥ navigation responseEnd）；截图 01 |
| 2 | 鼠标视差（远近不同速） | ✓ 右上 `(1360,120)` → camera `(x +0.28, y +0.22)`，左下 `(40,820)` → `(x −0.28, y −0.24)`，方向对、幅度均 ≤0.31（±0.3 + lerp 惯性） |
| 3 | 花瓣层不挡交互 | ✓ `elementFromPoint` 签卡 / 签卡 `<a>` / header / 收藏心 / 搜索框 / 问问樱见 / tabs 全部命中自身、无一命中 layer；**实点**收藏心 `aria-pressed` 翻转（点击未被吞） |
| 4 | 切后台暂停、切回恢复 | ✓ `document.hidden=true` → `frame` 0 变化；恢复 → `frame` 继续增长 |
| 5 | 移动端 375 降密度 | ✓ `count=15`、`scene.children=15`、`geo≤15`、`calls≤30`、`scrollWidth ≤ innerWidth+1`（无横向溢出） |
| 6 | 暗色花瓣可见 | ✓ 暗色下 count=40、canvas 在、帧持续递增；截图 02 |
| 7 | 签卡纯静态 + 站点直达 | ✓ 无 `role`/`tabindex`/`cursor-pointer`/`onclick`/摇签 class/「摇一摇」文案；**连点 3 次签文逐字不变**；`target=_blank` + `rel=noopener` + `http(s)` 直达；签文命中模板池 |
| 8 | SakuraBurst 仍在 | ✓ `.sakura-layer` 点击后 `.sakura-petal ≥ 3`、`pointer-events:none`、`z-index > 0`（高于 3D 层） |
| 9 | 主站/音乐/AI 页无回归 | ✓ 收藏 toggle 翻转 · 主题切换 · 搜索过滤（`food-card` 减少）· 音乐播放器展开/收起 · `/ask` 可达 + 输入框 `elementFromPoint` 命中自身 + layer `pointer-events:none` + count=40；截图 03 |
| 10 | reduced-motion 无动画 | ✓ `Emulation.setEmulatedMedia(prefers-reduced-motion: reduce)` → 组件 `return null`（无 layer、无 canvas），签卡仍正常渲染 |

**全程无未捕获页面异常**（`Runtime.exceptionThrown` = 0）。

## 4. 截图（3 张，`dev-docs/reports/task-24/`）

| 文件 | 内容 |
|---|---|
| `01-3d-sakura-light.png` | 首页亮色：花瓣只出现在卡片/导航**之外**的背景缝隙（左侧、右上、右下），PageDeco 星星在其上层共存，卡片视觉不受抢 |
| `02-3d-sakura-dark.png` | 暗色：粉白半透明花瓣在深底上清晰可见（左侧 3 片、右侧 2 片），opacity 0.65 无需调整 |
| `03-ask-no-overlap.png` | `/ask` 页面：**无花瓣盖住 AI 页 UI**（见踩坑①的 A/B 证据） |

## 5. 踩坑与修复（过程记录）

1. **「ask 页花瓣是否盖住 UI」的层叠风险 → A/B 截图证实安全，零改动**：`.ask-page { isolation: isolate }` 自成层叠上下文且 DOM 树序在 `z-0` 花瓣层之后 → 渐变背景整体盖住花瓣。证据：同一帧「有 3D 层」与「手动 `layer.remove()` 后」两张截图**像素级一致**（小圆点是 ask 页自己的装饰，两张图都有）。同法比对首页「有/无 3D 层」→ 花瓣只在背景缝隙出现。故**没有采用**备选的 `z-index:-1` 改动，`App.jsx` 挂载点维持 `.route-fade` 之前（`.route-fade` 动画后无层叠上下文、布局内容全在 `relative z-10` 内 → 花瓣恒在其下）。
2. **绘制量断言连修三轮（脚本对 three 语义的三次误判，非产品 bug）**：
   - `geo === 40` ✗ → `WebGLGeometries` 只统计**已入画**的 geometry，视锥剔除使 `geo` 从 17 单调涨到 40（实测 25→40），改断言「`10 ≤ geo ≤ 40`」；
   - `calls ≥ 40` ✗ → 视锥剔除后**每帧只有 20~25 瓣可见**，`calls` 实测 30~50，改「`calls ≥ 20`」；
   - `calls ≤ 44` ✗ → 用 `drawElements` + `modelViewMatrix` 逐帧探针抓到**每帧每个可见花瓣恰好 2 次 draw、矩阵完全相同**（`draws=58, distinct=29`），定位到 three 源码 `WebGLRenderer.js:2164-2174`：**`transparent && DoubleSide && forceSinglePass===false` 走双 pass**（BackSide + FrontSide 各一次）→ `calls = 2 × 可见花瓣 ≤ 2×count`。最终断言 `scene.children===40 && tris===2×calls && calls≤2×count`（为此把 `scene/petals` 加进验收钩子）。
3. **Edge 被遮挡 → rAF 停摆、`frame` 恒 0（首轮 metrics 全 0）**：窗口存在但非前台时 `document.hidden=true`。验收脚本开头加 `Emulation.setFocusEmulationEnabled` + `Page.setWebLifecycleState: active` 护栏（与 STATUS 记录的 `--disable-features=CalculateNativeWinOcclusion` 等启动参数互补）。
4. **wrangler pages dev 偶发慢/瞬时失败 → three chunk 拉取不到 → 组件静默降级**：`ensureSakura()` 就绪探测（hook + canvas + `frame>2`）失败时最多 `Page.reload` 重试 3 次。
5. **PowerShell 无 `rg`、中文文件名/长脚本易坏**：验收脚本与报告一律用编辑工具写文件；`Get-Content`/`Select-String` 只做只读取证。

## 6. 部署状态

**默认不部署（任务卡口径）。** 改动纯前端（`src/**` + `package.json` + three），如需上线：

```
npm run build && npx wrangler pages deploy dist --project-name food-nav
```

（cron / D1 / secrets 零改动；回滚仍回 `625437fb`）。**注意**：线上部署会把 `three` 独立 chunk 一并上传（+736kB / gzip 187kB，仅在用户首帧后按需拉取）。

## 7. 遗留与备注

- verify 断言数 **54 未变**（任务卡允许 ±1，本次为 0 调整），`tests/verify.mjs` 一行未改。
- 验收钩子 `host.__sakura3d = { camera, renderer, count, scene, petals }` 为**只读取证**用途（不写 DOM、不改产品行为）；如不希望暴露，可只保留 `{ camera, renderer, count }`，但清单 1/5 的 `scene.children` 断言需同步回退。
- **性能可选项（本次未做）**：给 `MeshBasicMaterial` 加 `forceSinglePass: true` 可把绘制调用砍半（每瓣 2 次 → 1 次）；因 `depthWrite:false` 的单片花瓣视觉差异极小，但属任务卡未要求的优化，保持原样。
- 本地验收环境：`npx wrangler pages dev dist --port 8788`（log: `pages-dev.log`）+ Edge CDP `--remote-debugging-port=9222`（独立 user-data-dir，验收后两进程仍开着，可手动关闭）。
- 花瓣数/密度/透明度均落在任务卡给定区间（30~50 片、0.12~0.2、opacity 0.65、粉白 0xffb6cd 系），暗色不需额外调整。
