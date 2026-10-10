# task-24 · 3D 樱花背景（three.js）+ 签卡去摇签 T1

> 背景：task-23 已完成（今日签 + 工作台极简），用户反馈：
> ① 签卡「摇一摇换签」互动鸡肋没意思 → **去掉点击换签，签卡变纯静态每日推荐**
> ② 想用 three.js 升级视觉 → **方案 A：3D 樱花飘落全屏背景**（渐进增强现有樱花主题）
>
> 设计方向：30-50 片半透明 3D 樱花花瓣从屏幕深处缓慢飘落，带翻转/旋转/风场摆动，鼠标移动有轻微视差；常驻背景氛围，不抢卡片视觉。

---

## 先读这些文件（动手前必读）

- `src/components/DailyFortune/DailyFortune.jsx` + `fortune.css` — 要去掉摇签交互
- `src/components/effects/SakuraBurst.jsx` — 现有 2D 点击溅花瓣（保留，参考它的挂载/降级模式）
- `src/components/PageDeco.jsx` — 现有星星视差背景（层级参考，花瓣层要和它共存不打架）
- `src/App.jsx` — 根组件挂载点
- `src/index.css` — token 变量（--food-surface 等）
- `tests/verify.mjs` — 54 断言（注意签卡断言里有没有「点击换签」相关）
- `dev-docs/STATUS.md`

---

## 任务 1：签卡去摇签（小改）

`src/components/DailyFortune/DailyFortune.jsx`：
- **删掉**：点击摇签逻辑（CSS 摇晃动画类、Math.random 换签、签卡 onClick）
- **保留**：日期种子固定的每日推荐签文（同一天一致）、站点名直达链接（target=_blank）
- 签卡变成**纯静态展示**（无 hover 动画也可以，或保留极淡 hover）
- `fortune.css` 里摇晃动画 keyframe 删掉

---

## 任务 2：3D 樱花飘落背景（three.js，核心）

### 新建组件
`src/components/effects/Sakura3DBackground.jsx`

### 实现要点

1. **lazy 动态加载 three**（关键：不进首屏 chunk）
   ```js
   // 组件内 useEffect 里动态 import，不要顶部 import three
   const THREE = await import('three');
   ```
   vite 会自动把 three 拆成独立 chunk（~150KB gzip），首屏不阻塞。

2. **安全降级（重中之重，verify 是 jsdom 会跑这个组件）**：
   - `typeof WebGLRenderingContext === 'undefined'` 或 `!window.WebGLRenderingContext` → 直接 return null，不加载 three
   - `import('three')` try/catch，失败静默 return
   - `prefers-reduced-motion: reduce` → 不启动动画（渲染静态或直接 return）
   - **jsdom 里绝对不能报错**（否则 verify 全挂）

3. **花瓣实现**：
   - PlaneGeometry(0.12~0.2, 0.12~0.2)（随机尺寸），MeshBasicMaterial({ color: 0xffb6cd, transparent: true, opacity: 0.65, side: DoubleSide })
   - 桌面 40 片 / 移动端（matchMedia width<768）15 片
   - 每片随机：初始位置（x: -5~5, y: 3~8, z: -2~2）、下落速度 0.3~0.8、旋转速度、摆动幅度
   - 动画：y 持续下降（delta time）+ x 正弦摆动（风场）+ mesh.rotation.z/x 缓慢翻转
   - 落到屏幕底部（y < -5）→ recycle 回顶部（新随机参数）

4. **鼠标视差**：
   - window mousemove → camera.position.x/y 轻微偏移（±0.3），平滑 lerp
   - 花瓣 z 值不同 → 近快远慢（天然 3D 感）

5. **性能**：
   - requestAnimationFrame，切后台（visibilitychange hidden）暂停
   - resize 时更新 camera aspect + renderer size
   - 组件卸载 dispose（geometry/material/renderer），防内存泄漏

6. **层级与样式**：
   - `<canvas>` 容器：`position: fixed; inset: 0; z-index: 0; pointer-events: none;`
   - **视觉上必须在所有内容（卡片/导航/星星）下面**——用 z-index 实测（elementFromPoint 验证卡片可点、导航毛玻璃在上）
   - 与现有 PageDeco 星星共存：星星在上层（保留），花瓣在星星下层或同层不打架

7. **暗色适配**：花瓣粉白半透明在暗色下仍可见（opacity 0.5~0.7），不用改。

### 挂载点
`src/App.jsx` 根组件挂 `<Sakura3DBackground />`（和 SakuraBurst 同级，main 外）。

---

## 禁止红线

- `src/components/NavCard/**`、`Layout/**`、`MusicPlayer/**`、`TypeWriterQuote.tsx`、主站 Header.jsx **零改动**
- SakuraBurst（2D 点击溅花瓣）保留不删（即时反馈 vs 常驻氛围，不冲突）
- ask 流式逻辑逐行不动
- 不改 tailwind.config.js / index.css 既有 token
- tests/verify.mjs 54 断言语义保持；签卡若有「点击换签」断言改成「签卡静态渲染」，允许 ±0~1 条调整

---

## 坑点预警

1. **jsdom 无 WebGL**：这是最大坑。组件 mount 时必须先检测 WebGL 支持，不支持就 return null。lazy import three 在 jsdom 里可能 reject，try/catch 包死。
2. **three.js 分包**：必须 useEffect 里 `await import('three')`，不能顶部静态 import（否则 three 进首屏 chunk，98KB → 250KB+）
3. **pointer-events: none**：canvas 容器必须加，否则挡住全屏点击（SakuraBurst 全局 click 也会受影响）
4. **z-index 实测**：用 elementFromPoint 确认卡片中心可点、导航栏可交互、花瓣只在视觉下层
5. **花瓣别太密太艳**：opacity 0.65、粉白（0xffb6cd 附近），是氛围不是主角。太密会抢卡片视觉
6. **签卡去摇签后 verify 断言**：先 grep verify.mjs 里 DailyFortune / 签卡相关断言，同步改
7. PowerShell 别写中文文件

---

## 验收清单

```
命令基线：
  npm run lint   → 0 警告 0 错误
  npm run build  → ✓（确认 three 被拆成独立 chunk，不在首屏 index-*.js 里）
  npm run verify → 全过（54 ± 1）

手动清单：
 1. 首页出现 3D 樱花花瓣飘落（翻转/摆动/有层次），不抢卡片视觉
 2. 鼠标移动 → 花瓣轻微视差（远近不同速）
 3. 花瓣层不挡交互：卡片可点、导航可点、签卡站点链接可点
 4. 切后台标签页 → 动画暂停；切回恢复
 5. 移动端（375）花瓣降密度（~15 片）
 6. 暗色模式花瓣正常可见
 7. 签卡：纯静态每日推荐，点击无摇签动作；站点名直达链接正常
 8. SakuraBurst 点击溅花瓣仍在
 9. 主站收藏/主题/搜索/音乐播放器/AI 页 无回归
10. reduced-motion 用户 → 无花瓣动画

截图（2-3 张，dev-docs/reports/task-24/）：
  01-3d-sakura-light.png — 首页 3D 花瓣亮色
  02-3d-sakura-dark.png — 暗色
```

---

## 部署状态
默认不部署。完成后汇报。
