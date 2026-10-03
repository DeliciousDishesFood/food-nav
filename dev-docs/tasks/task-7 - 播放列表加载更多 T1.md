# task-7 · 播放列表「加载更多」分页 T1

> 本文件由副参谋生成。OpenCode 执行前请**完整通读本文件**，并按下方启动指令先读取关联文件。

---

## 🚀 启动指令（可直接整段复制到 OpenCode 窗口）

先读 `E:\react\food-nav\src\components\MusicPlayer\useMusicPlayer.js`、`E:\react\food-nav\src\components\MusicPlayer\MusicPlayer.jsx`、`E:\react\food-nav\src\components\MusicPlayer\musicApi.js`、`E:\react\food-nav\src\components\MusicPlayer\musicFallback.js`，以及本任务文档 `E:\react\food-nav\dev-docs\tasks\task-7 - 播放列表加载更多 T1.md`。

任务：为 food-nav 悬浮音乐播放器的网易云歌单增加**分页加载更多**——① **首步实测**：`limit=25/35` 时接口是否返回更多歌曲（决定方案可行性，见「⚠️ 首步实测」）② 歌单列表底部加「加载更多」按钮，点击后请求下一批歌曲并**追加** ③ 追加时**按 id 去重**，已渲染歌曲不重渲染、当前播放不打断 ④ 歌词能力对新歌自动生效 ⑤ 无更多时隐藏按钮。

硬约束：只允许修改 `musicApi.js` / `useMusicPlayer.js` / `MusicPlayer.jsx` 三个文件（播放器内部，不动其它组件）；**不新增依赖**；风格统一（贴纸感小按钮）；`tests/verify.mjs` 不动且 40 断言全过；不打断当前播放、不重置播放进度。

完成后按本文「✅ 验收与汇报」逐项验证并汇报（**含 2 张截图**：加载更多前 / 加载更多后）。

---

## ⚠️ 首步实测（最关键，决定方案）

当前歌单接口（musicApi.js 内写死）：
```
GET https://node.api.xfabe.com/api/wangyi/userSongs?uid=18441576713&limit=15
```
已知事实（副参谋实测）：**该接口返回不稳定**——同参数多次请求返回 4~13 首不等；`limit=15` 是期望上限，实际按接口/上游状态返回。

**第一步先 curl 实测**：
```
curl "https://node.api.xfabe.com/api/wangyi/userSongs?uid=18441576713&limit=25"
curl "https://node.api.xfabe.com/api/wangyi/userSongs?uid=18441576713&limit=35"
curl "https://node.api.xfabe.com/api/wangyi/userSongs?uid=18441576713&limit=45"
```
判断标准：
- `limit=25` 返回 **>15 首**（或有首轮未见的新歌）→ **分页可行**，按本任务卡完整实现
- `limit=25/35/45` 均返回 ≤15 首且与 limit=15 基本一致 → **接口不支持分页**，**停止实现**，在交付汇报中说明「limit 递增无效，加载更多不可行」，并给出建议（换 uid 歌单 / 换接口 / 取消功能）
- 若接口偶发返回多首，以 3 次请求平均为准

**交付时必须附上 curl 实测结果原文（各 limit 的返回数量）。**

---

## 📐 实现规格（副参谋拍板）

### 1. musicApi.js
- `PLAYLIST_API` 改为函数：`fetchPlaylist(limit, signal)`（limit 参数化，默认 15）
- 保持现有返回结构（规范化的 songs 数组 / null）

### 2. useMusicPlayer.js（核心）
- 新增状态：`hasMore`（boolean）、`loadingMore`（boolean）
- 新增 `loadMore()`：
  ```
  守卫：loadingMore 或 listState !== 'remote' 或 !hasMore → return
  计算新 limit = 当前已加载数 + STEP（STEP = 10，固定步进）
  请求 fetchPlaylist(newLimit)
  成功：按 id 去重（已有 Set + 新数组），仅追加新歌；applyList(合并数组, 'remote')
        hasMore = 新返回中新歌数量 > 0 且 新返回长度 >= STEP（接近饱和才算有更多）
  失败：loadingMore=false，setStatus('加载失败，请重试')（不打断播放）
  全程不碰 indexRef / 当前歌曲 / 播放进度
  ```
- **去重**：`const seen = new Set(songsRef.current.map(s => s.id))`；新歌 `filter(s => !seen.has(s.id))`
- **hasMore 判定**：追加后若「本次新歌数 > 0」且「接口返回数 ≥ limit 请求的期望数」→ 还有更多；否则 hasMore=false（防止死循环请求）
- `loadPlaylist()`（首次）初始化 hasMore=true（或由首次结果推断）、loadingMore=false
- 导出 `loadMore` / `hasMore` / `loadingMore`
- **注意 StrictMode**：loadMore 用 ref 守卫（参考 listLoadingRef 模式），避免双发

### 3. MusicPlayer.jsx
- 歌单列表（`.max-h-44` 滚动区）底部，在 `songs.map` 之后渲染：
  - `hasMore` 时：贴纸感按钮「加载更多 ♪」（小号：`text-[11px] rounded-full border-2 border-food-line bg-food-tagBg px-3 py-1.5 text-food-primary shadow-foodSticker hover:-translate-y-0.5 transition-all`，居中，宽 `w-full` 或 `mx-auto`）
  - `loadingMore` 时：按钮禁用 + 文案「加载中…」
  - `!hasMore && listState === 'remote'` 时：可显示「已全部加载」（`text-[11px] text-food-muted text-center`）
  - 点击 → `player.loadMore()`
- `listLabel`（网易云 · N 首）随追加自动更新（songs.length 变化即可，确认现有代码已用 songs.length）
- 按钮 `aria-label="加载更多歌曲"`（**禁 aria-pressed**，verify 约束）

### 4. 歌词（自动覆盖，需验证）
- `lyricsCache` 是 `Map<id, lyrics>`：新追加歌曲播放时按 id 正常 fetch/缓存 ✓ **无需代码改动**
- 验证：加载更多后点一首新歌，歌词正常显示

---

## 🚫 禁止改动
- `musicFallback.js`（本地兜底 6 首不动）
- `TypeWriterQuote.tsx` / `musicBus.js` / 其它组件
- `tests/verify.mjs`（40 断言全过）
- 播放器现有行为：失败跳歌 / 兜底切换 / 记忆恢复 / StrictMode 守卫一律保持

## ⚠️ 坑点预警
1. **limit 实测是第一步**，无效就停（见上），不许硬编码假装成功
2. 去重必须做（接口可能返回已加载歌曲）
3. `applyList` 会 setSongs 整个新数组——React 按 key 复用 DOM，**已有卡片不会重渲染**，但确认 key 用的是 `song.id`
4. 追加不得重置 `indexRef` / 当前播放 / 进度 / `savedRef` 记忆
5. 加载更多失败：只提示，不打断播放、不切兜底
6. hasMore 判定防死循环（接口不稳定时宁少勿多）
7. 播放器按钮只用 aria-label，禁 aria-pressed；面板在 `<main>` 外
8. 不新增依赖

---

## ✅ 验收与汇报

### 验证命令
```
npm run lint    # 0 警告 0 错误
npm run build   # 构建通过
npm run verify  # 40 断言全过
```

### 手动验证清单（逐项 ✓/✗）
1. 展开播放器：列表底部出现「加载更多 ♪」按钮（仅网易云歌单态）
2. 点击后：按钮变「加载中…」，请求发出（Network 面板可见 limit=25）
3. 完成后：列表**追加**新歌（总数增加），**已渲染歌曲位置/状态不变**
4. 当前正在播放的歌：加载更多前后播放不中断、进度不跳
5. 去重验证：追加后无重复歌曲 id
6. 加载到没有更多时：按钮消失（或显示「已全部加载」），不再触发请求
7. 加载更多失败（断网）：提示「加载失败」，播放不中断
8. 点一首新追加的歌：播放正常 + **歌词正常显示**
9. 暗色模式按钮样式正常
10. 375px 移动端：按钮不溢出、可点

### 汇报格式
1. **limit 实测结论**（第一步）：`limit=25/35/45` 返回数量原文；结论=分页可行/不可行
2. 改动清单：3 个文件各改了什么（函数/状态/JSX）
3. 验证结果：lint / build / verify + 手动清单 10 项逐条 ✓/✗
4. **2 张截图**：加载更多前（列表底部无新歌）/ 加载更多后（总数增加、按钮状态）
5. 遗留问题与风险
