# task-6 · 悬浮音乐播放器 T1

> 本文件由副参谋生成。OpenCode 执行前请**完整通读本文件**，并按下方启动指令先读取关联文件。

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\README.md`、`E:\react\food-nav\skills\anime-food-style\SKILL.md`、`E:\react\food-nav\src\index.css`、`E:\react\food-nav\tailwind.config.js`、`E:\react\food-nav\src\components\TypeWriterQuote.tsx`、`E:\react\food-nav\src\components\Layout\Layout.jsx`，以及本任务文档 `E:\react\food-nav\dev-docs\tasks\task-6 - 悬浮音乐播放器 T1.md`。

任务：为 food-nav 新增**右下角悬浮音乐播放器**（React 原生 `<audio>`，不引入任何播放器库）——① 拉取网易云歌单（接口见「接口」节，uid 已换新，实测该小号仅 2 首收藏，属正常）② songUrl 取播放地址，失败/空/超时**自动跳下一首**，连续失败 ≥5 首停止并提示 ③ 歌单接口失败切本地兜底 6 首（URL 已实测 206+audio/mpeg+支持 Range）④ 完整版交互：收起按钮 + 展开面板（封面/歌名/歌手 + 播放/暂停/上一首/下一首 + 可拖拽进度条 + 音量滑杆 + 歌单列表点选）⑤ 播放状态 localStorage 记忆（刷新恢复）。

硬约束：**全部新建文件**，唯一允许改动 `Layout.jsx` 加两行挂载（见「文件结构」）；**不新增依赖**；风格与现有完全统一（毛玻璃/半透白底/圆角/细白边框/硬阴影/dark 适配）；播放器 `z-40`；播放器默认收起、不自动播放（浏览器策略）。

完成后按本文「✅ 验收与汇报」逐项验证并汇报（**含 3 张截图**）。

---

## 📡 接口（副参谋已实测）

### 1. 歌单接口 ✅ 可用
```
GET https://node.api.xfabe.com/api/wangyi/userSongs?uid=18441576713&limit=15
```
实测返回（2026-10-02）：
```json
{ "code": 200, "msg": "获取成功",
  "data": {
    "uid": "18441576713",
    "songName": "我喜欢的音乐",
    "userName": "云村村民179092463199688",
    "songs": [
      { "id": 2752778648, "name": "发如雪（纯音改编）", "artistsname": "186靓仔", "picurl": "https://p1.music.126.net/...", "album": "个人改编", "duration": 300826 },
      { "id": 2640178002, "name": "发如雪 (女声版)", "artistsname": "余不不", "picurl": "https://p1.music.126.net/...", "album": "...", "duration": 253000 }
    ]
  }
}
```
⚠️ **该 uid 实测仅返回 2 首收藏**（接口按真实收藏数返回，limit 不凑数）。字段契约：`songs[].id`(number) / `name` / `artistsname`(歌手，逗号分隔) / `picurl`(封面) / `album` / `duration`(毫秒)。

### 2. 播放地址接口 ⚠️ 实施首步必须验证
```
GET https://node.api.xfabe.com/api/wangyi/songUrl?id=<歌曲id>
```
已知：按此格式实测**全部 404**（歌单接口正常），疑为路径/参数/header 差异。OpenCode 第一步：浏览器直接访问验证正确调用方式（必要时试 `br=320000`、带 `Referer: https://music.163.com/` 等），确认后按真实结构适配。**若确认不可用，播放器必须仍完整可用**（走兜底 + 优雅降级），不得阻塞交付。

---

## 🎵 兜底歌曲（已实测可播，直接照抄写入 `musicFallback.js`）

```js
export const FALLBACK_SONGS = [
  { id: 'fb-1', name: 'SoundHelix Song 1', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'fb-2', name: 'SoundHelix Song 2', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'fb-3', name: 'SoundHelix Song 3', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { id: 'fb-4', name: 'SoundHelix Song 4', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  { id: 'fb-5', name: 'SoundHelix Song 5', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
  { id: 'fb-6', name: 'SoundHelix Song 6', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
]
```
来源：soundhelix.com 免费音乐（官网声明音频可自由使用）。全部实测 HTTP 206 + `audio/mpeg` + 支持 Range（进度条 seek 依赖）。

**播放列表策略**（关键，避免干播卡死）：
- 歌单接口成功 → 播放列表 = 接口歌曲（当前 2 首）
- 歌单接口失败 / 返回空 → 播放列表 = `FALLBACK_SONGS`（6 首）
- 接口歌曲的 songUrl 全部不可播 → **同样切换 `FALLBACK_SONGS`**，绝不空转

---

## 📁 文件结构（全部新建，仅一处侵入）

```
E:\react\food-nav\src\components\MusicPlayer\
├── MusicPlayer.jsx       悬浮容器 + 收起按钮 + 展开面板（fixed bottom-6 right-6 z-40）
├── useMusicPlayer.js     播放状态机 hook（audio ref / 列表 / 跳过逻辑 / 进度 / 音量）
├── musicApi.js           两个接口封装（fetch + 5s 超时 + 错误分类）
└── musicFallback.js      上述兜底数组
```
唯一允许的现有文件改动——`src\components\Layout\Layout.jsx` 恰好两行：
```jsx
import MusicPlayer from '../MusicPlayer/MusicPlayer.jsx'
// ...
<MusicPlayer />   // 放在 <ToastHost /> 旁边
```
除此之外**不得修改任何现有文件**（含 index.css / tailwind.config.js / 其它组件）。

---

## 🎯 P0 核心闭环（必须完成）
1. 挂载后拉歌单 → songs 数组 → 就绪；失败/空 → 切 `FALLBACK_SONGS`
2. 播放某首：先 songUrl 取地址 → 成功设 `audio.src` 播放；失败（HTTP 非 2xx / 空 url / 解析失败 / 超时 / audio `onerror`）→ **自动跳过下一首**；连续失败 ≥5 首停止自动尝试并提示「歌曲暂时无法播放」
3. 控制：播放/暂停、上一首、下一首、播放结束 `onended` 自动下一首（列表循环）
4. 视觉：收起 = 48px 圆形毛玻璃按钮（`rounded-full border-2 border-food-line bg-white/70 backdrop-blur-md shadow-foodHeader dark:bg-[#241A33]/75`），播放中图标有旋转/律动；展开面板 `rounded-[20px]` 同系毛玻璃，含封面 + 歌名 + 歌手 + 控制区
5. 图标用 morphicons：Play / Pause / SkipBack / SkipForward / Volume2 / VolumeX / ListMusic / Music
6. 按钮 ≥40px；暗色适配（food-* token 或 dark: 变体，不得硬编码亮色值）

## 🎯 P1 完整版增强（用户已选「完整版」，本期一并交付）
1. 可拖拽进度条（粉色系，点击/拖动 seek，显示已播/总时长 mm:ss）
2. 音量滑杆 + 静音切换，音量记忆 localStorage `food-nav:volume`
3. 展开面板内可滚动歌单列表（封面缩略 + 歌名 + 歌手，当前播放高亮），点击切歌；窄屏面板 `max-w-[calc(100vw-2rem)]` 不溢出
4. 播放状态记忆 localStorage `food-nav:music`（歌曲 id / 是否播放 / 进度秒），刷新恢复

---

## ⚠️ 坑点预警
1. **songUrl 失败 = 404 / 空 / 超时 都要跳歌**，绝不能卡死播放器（最高优先级）
2. 浏览器无手势禁止自动播放：默认收起不自动播，用户点播放按钮才开播
3. audio `onerror` 也要兜（URL 返回但音频损坏/403）
4. 跳过计数防死循环（上限 5）
5. StrictMode 开发双调用：拉歌单用 ref 守卫防重复 fetch
6. 卸载清理：pause + 清 src + 清定时器 + abort 进行中的请求
7. z-index：播放器 z-40（toast=z-50、Header=z-20，**不得改动它们**）
8. 进度/音量滑杆样式：优先 `accent-food-primary`（Tailwind accent 支持 var 色）；如需自定义轨道则**只能在 index.css 末尾追加**新规则，不得改现有规则
9. package.json **不加依赖**（如需必须报备）
10. 接口地址写死常量，不做代理（公益 API 无跨域）

---

## 🚫 禁止改动（复查重点）
- `src/index.css` 现有规则：主题变量 / 滚动条 / `.food-card` / reduced-motion —— 只许追加，不许修改
- 打字机、毛玻璃导航栏、星星视差、卡片 hover 形变、懒加载、搜索/分类/收藏/主题逻辑——一律不动
- `tests/verify.mjs` 不动；新组件不得破坏现有 40 条断言
- `README.md` 本轮不动

---

## ✅ 验收与汇报

### 验证命令
```
npm run lint    # 0 警告 0 错误
npm run build   # 构建通过
npm run verify  # 40 条断言全过
```

### 手动验证清单（逐项 ✓/✗）
1. 右下角出现毛玻璃播放器按钮，点击展开面板
2. 点击播放：有真实声音输出
3. 歌单列表展示正常（接口可用时 2 首；可手动断网验证切到 SoundHelix 6 首）
4. 上一首 / 下一首 / 播放结束自动连播正常
5. 断网或接口失败：自动切兜底 SoundHelix，播放器不卡死、不白屏
6. 连续失败 ≥5 首：出现「歌曲暂时无法播放」提示并停止自动跳
7. 暗色模式下播放器样式正常（毛玻璃/边框/文字）
8. 375px 宽移动端：面板不溢出、按钮可点
9. 刷新页面：恢复上次播放状态（歌曲 + 进度 + 播放中状态）
10. 原有功能无回归（打字机/搜索/收藏/主题/404）

### 汇报格式（OpenCode 交付时按此结构）
1. **改动清单**：新建文件列表 + Layout.jsx 侵入两行原文
2. **songUrl 接口验证结论**：最终是否可用 / 实际调用方式 / 示例响应原文（或确认不可用）
3. **验证结果**：lint / build / verify + 手动清单 10 项逐条 ✓/✗
4. **3 张截图**：桌面亮色展开态 / 暗色展开态 / 移动端展开态
5. **遗留问题与风险**
6. **兜底是否被触发过**及触发场景
