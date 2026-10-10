# task-25 · 方案C：3D 粉月亮 + 樱花树装饰层 + 花瓣立体化 + 删签卡 T1

> 背景：task-24 已完成 3D 樱花飘落背景（PlaneGeometry 平面片）。用户反馈：
> ① 平面花瓣转侧边露馅（没有厚度）→ 立体化
> ② 签卡摇签功能已去但 UI 还在页面上 → **整个删掉 DailyFortune**（用户判定鸡肋）
> ③ 本次上方案 C：**3D 粉月亮（右上）+ 低多边形樱花树（远处）背景装饰层**
>
> 设计：月亮粉白渐变（中心偏白边缘樱花粉）+ 柔和 glow；树圆润低多边形粉白渐变，远景剪影；花瓣 recycle 起点偏树 x 位置（视觉上从树上飘落）；月亮/树参与鼠标视差（比花瓣更慢更远）。

---

## 先读这些文件（动手前必读）

- `src/components/effects/Sakura3DBackground.jsx` — 现有 3D 花瓣（要升级：立体花瓣 + 加月亮/树）
- `src/components/DailyFortune/` — 要整个删除
- `src/pages/HomePage.jsx` — 签卡挂载点（要摘掉）
- `src/App.jsx` — Sakura3DBackground 挂载点
- `tests/verify.mjs` — 54 断言（找 DailyFortune / 签卡相关断言，删除后同步）
- `dev-docs/STATUS.md`

---

## 任务 1：删除 DailyFortune 签卡（用户判定鸡肋）

- 删除 `src/components/DailyFortune/` 整个目录（DailyFortune.jsx + fortune.css）
- `src/pages/HomePage.jsx` 摘掉 `<DailyFortune />` 挂载 + import
- `tests/verify.mjs` 里签卡渲染相关断言删除（54 → 53，语义保持不删其他）

---

## 任务 2：Sakura3DBackground 升级（核心）

### 2a. 花瓣立体化（解决平面露馅）
现在每片是单个 PlaneGeometry（转侧边变一条线）。改为：
- **两片 plane 交叉成十字花瓣形**：每片"花瓣"= 两个 PlaneGeometry 垂直交叉（x 形 + z 形各一，或用 Group 包两片 90° 交叉）
- 或更简：plane 顶点做轻微弯曲（修改 plane 的 vertices 让边缘上翘）——优先两片交叉，效果好实现
- 材质保持 MeshBasicMaterial 粉白半透明 DoubleSide
- 数量/动画/视差/recycle 逻辑不变

### 2b. 新增粉月亮（右上）
- SphereGeometry(0.8, 32, 32)（球体，真 3D 有厚度）
- 位置：右上远景（x: 3.5, y: 3, z: -3，相对相机）
- 材质：MeshBasicMaterial 或 MeshLambertMaterial，**粉白渐变**——用 CanvasTexture 画径向渐变（中心 #fff8fa 边缘 #ffb6cd）贴到球上
- glow：外圈一个更大的半透明粉球（opacity 0.15）做发光晕
- 参与鼠标视差：偏移量比花瓣小（更远更慢）

### 2c. 新增低多边形樱花树（右下/远处）
- 简化结构：一个主干（CylinderGeometry 细棕色）+ 一团圆润树冠（几个重叠的 IcosahedronGeometry 低多边形，粉白渐变 #ffd9e6→#fff0f5）
- 位置：右下远景（x: 3, y: -3.5, z: -2）
- 低多边形风格（flat shading），圆润可爱
- 参与鼠标视差：偏移量最小（最远）

### 2d. 花瓣 recycle 起点偏树 x
- 花瓣落到屏幕底部 recycle 时，初始 x 偏向树的 x 位置附近随机（视觉上"从树上飘下来"）

---

## 禁止红线

- `src/components/NavCard/**`、`Layout/**`、`MusicPlayer/**`、`TypeWriterQuote.tsx`、主站 Header.jsx **零改动**
- ask 页（src/ask/**）**零改动**（.ask-page isolation:isolate 已盖住 z-0 层，不动）
- SakuraBurst 2D 点击花瓣保留
- three.js 仍 lazy import（不进首屏 chunk）
- jsdom/WebGL/prefers-reduced-motion 降级逻辑保留
- z-index/pointer-events none 规则不变（装饰层不挡交互）

---

## 坑点预警

1. **球体渐变**：three.js MeshBasicMaterial 不支持顶点渐变色贴图自动——用 Canvas 2D 画径向渐变生成 texture，贴 SphereGeometry（注意 uv 映射，球体贴图会有接缝，可接受或用简单顶点色）
2. **月亮 glow**：外圈半透明球 opacity 0.12~0.18，别太亮抢视觉
3. **树冠低多边形**：IcosahedronGeometry(detail=0/1) flat shading，3-5 个球重叠成团，别太复杂（性能）
4. **树/月亮位置**：fixed 背景层，要确认不挡内容——用 elementFromPoint 实测；移动端（375）树/月亮可以更小或调整位置不挤
5. **verify 53**：删签卡断言后总数 54→53，其他断言零改动
6. **花瓣交叉**：两片 plane 交叉 90°，旋转时立体感出来；注意每片 draw call ×2（task-24 已知 three 双 pass），控制总数别加（还是 40/15）
7. PowerShell 别写中文文件

---

## 验收清单

```
命令基线：
  npm run lint   → 0 警告 0 错误
  npm run build  → ✓（three 仍独立 chunk）
  npm run verify → 53/53（签卡断言已删）

手动清单：
 1. 首页右上出现粉白渐变月亮（带柔和 glow）
 2. 右下远处低多边形樱花树（粉白圆润树冠）
 3. 花瓣从树的方向附近飘落，交叉立体（转视角有厚度感，不再是平面片）
 4. 鼠标视差：月亮/树微移（比花瓣慢）
 5. 签卡已删（Hero 区干净，无残留 UI）
 6. 月亮/树/花瓣不挡交互（卡片/导航/链接可点）
 7. 暗色模式：月亮粉白仍可见，树粉白不突兀
 8. 移动端 375：月亮/树位置不挤内容
 9. 主站/AI 页/收藏/主题/音乐 无回归
10. reduced-motion / WebGL 不支持 降级正常

截图（3 张，dev-docs/reports/task-25/）：
  01-moon-tree-light.png — 亮色月亮+树+花瓣
  02-moon-tree-dark.png — 暗色
  03-mobile-375.png — 移动端位置
```

---

## 部署状态
默认不部署。完成后汇报。
