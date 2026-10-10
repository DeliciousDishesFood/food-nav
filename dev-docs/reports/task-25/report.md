# task-25 · 3D 月亮樱花树 + 签卡清理 · 验收报告

> 时间：2026-10-11 · 纯前端任务，**默认不部署**（线上版本仍是 M10 + M9-T3 + M9-T4）
> 结论：**全绿** — lint **0/0** · verify **53/53**（签卡断言已删，54 → 53）· build ✓（three 仍独立 chunk，未进首屏）· 本地 CDP 手动清单 **22/22** · 截图 3 张

---

## 1. 改动清单

| 文件 | 改动 |
|---|---|
| `src/components/DailyFortune/`（**整目录删除**） | `DailyFortune.jsx` + `fortune.css` 一并删除，签卡连同历史摇签功能整体下线 |
| `src/pages/HomePage.jsx` | 删 `import DailyFortune` 与 `<DailyFortune groups={groups} />` 挂载，Hero 区恢复干净 |
| `tests/verify.mjs` | **仅删 1 条断言** `home shows daily fortune card`（54 → 53），其余 53 条零改动；保留一行 task-25 注释说明删除原因 |
| `src/components/effects/Sakura3DBackground.jsx`（**重写，505 行**） | ① `makeCrossGeometry()`：两片 `PlaneGeometry` 绕 Y 轴 90° 交叉后手工合并成**一个** geometry（8 顶点 / 12 索引 → 单次 draw，侧转有厚度，不再是一张纸片）；② `makeMoonTexture()`：256×128 Canvas **双心**径向渐变（中心 `#fffdfb` → `#ffe9f1` → `#ffc2d6` → 边缘 `#ff9ec2`），渐变中心对准球面 u=0.25/v=0.5（正对相机处），在 `cx + w` 再画一颗心消除 u=0/1 接缝；③ `buildMoon()`：`SphereGeometry(0.8)` 贴图 + 外圈 `SphereGeometry(1.18)` / `BackSide` / `transparent` / `opacity 0.15` / `depthWrite:false` 的半透明 glow；④ `buildTree()`：`CylinderGeometry(0.055, 0.1, 0.95, 6)` 细棕树干 + 4 个 `IcosahedronGeometry(r, 0)` 树冠（`#ffd9e6 / #ffe2ec / #ffe6f0 / #fff0f5`，随机旋转叠成团）；⑤ `recycleX()`：花瓣回收重生时 x 取 `treeBase.x ± min(3, halfWidth*0.6)` 并夹紧视口（"从树上飘下来"）；⑥ `applyDecorLayout()`：`<768px` 月亮/树位置 ×0.5、尺寸 ×0.7（375 宽下不挤出内容）；⑦ tick 内月亮用 `targetX*0.5`、树用 `targetX*0.3` 的**同向**小视差 → 慢于花瓣；⑧ 验收钩子扩为 `host.__sakura3d = { camera, renderer, count, scene, petals, moon, tree }`；⑨ dispose 覆盖装饰层全部 geometry/material/texture；⑩ `detectRuntime()` / `await import('three')` 懒加载 / `visibilitychange` / resize / 无 WebGL / reduced-motion 降级**原样保留**（jsdom 中仍 `return null`） |

**红线合规**（`git status --short` 可证）：`NavCard/**`、`Layout/**`、`MusicPlayer/**`、`TypeWriterQuote.tsx`、主站 `Header.jsx`、`src/ask/**` **零改动**；three 仍 `await import()` 不进首屏；`fixed inset-0 z-0 pointer-events-none` + `aria-hidden` 规则不变；SakuraBurst（2D 点击溅花瓣）保留。

## 2. 命令基线（输出见同目录 txt）

```
npm run lint   → 0 警告 0 错误（lint.txt）
npm run verify → RESULT: 53 passed / 0 failed（verify.txt）
npm run build  → ✓ built in 872ms（build.txt）
  dist/assets/index-Z3jRo49_.js         317.03 kB │ gzip: 102.47 kB   ← 首屏，基线 task-24 315.63/102.01（+1.40 kB = 月亮/树/recycle 逻辑）
  dist/assets/three.module-4gI5Z-_B.js  736.58 kB │ gzip: 186.86 kB   ← three 独立 chunk（>500kB 警告属预期）
```

## 3. 手动清单（CDP `t25-accept.mjs` → **22 passed / 0 failed**，`accept-log.txt`）

| # | 清单项 | 结果 |
|---|---|---|
| 0 | 3D 层就绪 | ok `.sakura3d-layer` + canvas + `frame` 递增（`focusEmulation` + `setWebLifecycleState:active` 防 Edge 遮挡节流） |
| 5 | 签卡已删 | ok DOM 无 `.daily-fortune`、无「今日宜吃 / 摇一摇 / 今日签」文案 · `src/components/DailyFortune` 目录不存在 · `HomePage.jsx` 无 `DailyFortune` · verify 中断言名 `home shows daily fortune card` 已删 |
| 1 | 粉月亮 | ok `SphereGeometry` r=0.8 + `material.map`（径向渐变） + glow 子级 = 2、`glowRadius 1.18 > 0.8`、`BackSide`、`transparent`、`opacity 0.15` · 位置 x>0 y>0、NDC 在视野内 · 截图 01 |
| 1 | 3D 层规格 | ok `fixed / inset-0 / z-index:0 / pointer-events:none` · `count=40` · `scene.children=42`（40 瓣 + 月亮组 + 树组） · `geo ≤ 48` · `calls ≤ 2×count+7`（double-side 双 pass） · `tris ≥ 2×calls` · `hidden=false` · frame 递增 |
| 1 | three 懒加载 | ok `three.module-*.js` 的 `startTime ≥ navigation.responseEnd`（首屏不带 three） |
| 2 | 低多边形樱花树 | ok children=5（`CylinderGeometry` 树干 + 4× `IcosahedronGeometry`）· 树冠 `geometry.index === null`（非索引面法线 → 棱面观感）· 四团粉白配色正确 · x>0 y<0 · NDC 视野内 · 截图 01/02 |
| 3 | 立体花瓣 | ok 单片 = 两 plane 交叉 → **8 顶点 / 12 索引**、`opacity 0.65`、`DoubleSide`（单 geometry 单 draw，无 draw ×2） |
| 3 | recycle 偏树 | ok 把 `p.fall` 调 9 加速回收后：≥10 片 baseX 变化，且 40 片 `|baseX - 树x| ≤ 3.05` |
| 4 | 视差分层 | ok 鼠标右上 `(1360,120)` vs 左下 `(40,820)`：Δcam ≈0.56 > Δ月亮 ≈0.30 > Δ树 ≈0.18 > 0，X/Y 双向同序（月亮 0.5×、树 0.3× 同向跟拍 → 慢于花瓣） |
| 6 | 层不吃命中 | ok `elementFromPoint`：首卡 / header / 收藏心 / 搜索框 / 问问樱见 全部命中自身子树、**无一命中 layer**（`pe:none`、`z:0`） |
| 6 | 收藏心实点 | ok `aria-pressed` 翻转（点击未被吞） |
| 7 | 暗色 | ok 月亮/树/花瓣仍在跑（count=40、decor 在、frame 递增）· 截图 02 |
| 8 | 375px | ok `count=15`、月亮/树位置 ×0.5 尺寸 ×0.7 且仍在 NDC 视野内、`scrollWidth ≤ innerWidth+1` 无横向溢出 · 截图 03 |
| 9 | 主站 / AI 无回归 | ok 收藏 toggle · 主题切换 · 搜索过滤（卡片数减少）· 音乐播放器展开 · `/ask` 可达 + 输入框 `elementFromPoint` 命中自身 + ask 页月亮/树照常渲染在最底层 |
| 10 | reduced-motion | ok 组件 `return null`（无 layer / 无 canvas），主站正常渲染 |
| 10 | 无 WebGL | ok `Page.addScriptToEvaluateOnNewDocument` 删掉 `WebGLRenderingContext` → 组件 `return null`，主站不白屏 |

**全程无未捕获页面异常**（`Runtime.exceptionThrown` = 0）。

## 4. 截图（3 张，`dev-docs/reports/task-25/`）

| 文件 | 内容 |
|---|---|
| `01-moon-tree-light.png` | 亮色：右上粉月亮（径向渐变 + glow）+ 右下低多边形樱花树 + 交叉花瓣 |
| `02-moon-tree-dark.png` | 暗色：月亮/树/花瓣均清晰可见、不突兀 |
| `03-mobile-375.png` | 移动端：装饰层收缩到 0.5×/0.7×，不挤内容、无横向溢出 |

## 5. 踩坑 / 发现

1. **`MeshBasicMaterial` 不支持 `flatShading`**（three 只在 Phong/Standard/Normal/Lambert 等材质上定义该属性）。传入只会触发 `Material.setValues` 的 `"is not a property"` 告警并被忽略 → 校验里 `material.flatShading === true` 永远为 false。棱面观感实际来自 `IcosahedronGeometry` 自身：`PolyhedronGeometry` 内部 `computeVertexNormals()`（源码注释 `// flat normals`），几何体本身非索引、面法线直出。验收断言改为「树冠 `geometry.index === null`」，语义等价且不受材质影响。
2. **月亮渐变半径要对准"半球投影"**：球面正对相机的半球在贴图上只覆盖约 ±0.25w × ±0.42h，原 `radius = 0.42w` 时盘面边缘只走到渐变 6 成 → 目测就是一块扁平粉盘。改 `0.28w` 后盘缘落到深粉端，球感才出来。任务卡示例色（中心 `#fff8fa` / 边缘 `#ffb6cd`）在亮色主题（背景本身就是极浅粉）上对比度不足，改为 `#fffdfb → #ffe9f1 → #ffc2d6 → #ff9ec2`，暗色下同样成立。
3. **CDP `Page.reload` 会恢复历史滚动位置**：首轮验收里卡片探针 y 从 513 变 162、「问问樱见」y=-47 直接出屏，`elementFromPoint` 全线误报。探针与截图前统一 `scrollTo(0,0)` 并断言 `scrollY === 0`。
4. **`elementFromPoint` 的 `contains` 方向**：命中的可能是探针元素的**祖先**（卡片根 div 包住收藏心的 SVG）。判定改为 `el.contains(hit) || hit.contains(el)`，两侧都算"命中自身子树"。
5. **删除断言时的注释会污染验收正则**：`verify.mjs` 里为说明删除原因保留的 task-25 注释仍写着 `.daily-fortune`，按类名正则匹配会误报"断言没删"；改为按断言名 `home shows daily fortune card` 匹配。

## 6. 遗留 / 部署

- **遗留：无**。任务卡 10 项清单全绿，红线全部未触碰（`git status` 只含本任务 4 个文件的增删改）。
- **部署状态：默认不部署**（任务卡明示）。线上仍是 M10 + M9-T3 + M9-T4；本任务与 task-24 待一起发布。
