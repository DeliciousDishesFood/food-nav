---
name: anime-food-style
description: 樱花粉日系贴纸卡片风格（动漫贴纸 UI 补充版），配套 Morphicons 图标、硬偏移阴影、打字机暖心文案、懒加载卡片、弱视差背景、暗系紫黑双主题，适配 React + TailwindCSS
compatibility: tailwindcss 3.4+, react 18/19, morphicons, vite, cloudflare workers
metadata:
  style: anime-sticker
  primary: "#FF6B9D"
  primary-dark: "#FF8FB8"
  light-bg: "#fef2f7"
  card-radius: 24px
  scrollbar-thumb: "#FFB6CD"
  scrollbar-thumb-hover: "#FF8FB1"
  quote-text: "text-pink-500/80"
  dark-bg: "#16101F"
  dark-surface: "#241A33"
  dark-line: "#3E2F55"
---

# anime-food-style 动漫贴纸风 UI Skill（补充版）

## 一、核心视觉规范

### 1. 卡片
- 白底 + 2px 白描边 + 大圆角（`rounded-3xl` / 24px）
- 硬偏移阴影由变量驱动：`--shadow-card: 4px 4px 0 #FFE1EC, 0 12px 24px rgba(75,58,85,.08)`
- **hover：`rotate(-3deg) scale(1.02)`，`transition: transform .2s ease, box-shadow .2s ease`**
- hover 阴影：`8px 10px 0 #FFC9DC, 0 20px 32px rgba(255,107,157,.22)`（硬偏移必须保留）
- 卡片间留白 `gap-x-6 gap-y-7`，给旋转 hover 留空间

### 2. 滚动条（樱花粉主题，全局统一）
```css
html { overflow-y: scroll; }                 /* 永久占位，消除 Tab 切换横向抖动 */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: #FEF2F7; border-radius: 999px; }
::-webkit-scrollbar-thumb { background: #FFB6CD; border-radius: 999px; }
::-webkit-scrollbar-thumb:hover { background: #FF8FB1; }
html, body { scrollbar-width: thin; scrollbar-color: #FFB6CD #FEF2F7; }
/* 暗色必须同时命中 html 自身（根滚动条）与内部容器 */
html.dark::-webkit-scrollbar-thumb, html.dark ::-webkit-scrollbar-thumb { background: #7A5C9E; }
html.dark { scrollbar-color: #7A5C9E #221A2E; }
```

### 3. 导航栏
- 静态：`rounded-[28px]` + 白→粉渐变（`from-food-surface via-food-surface-2 to-food-surface-3`）+ `shadow-foodHeader`
- 向下滚（>60px 且位移 >4px）→ 毛玻璃：`rounded-[20px] bg-white/70 backdrop-blur-md`（暗色 `dark:bg-[#241A33]/75`）
- 向上滚立即还原；`transition-all duration-300 ease-out`；监听 `passive + requestAnimationFrame` 节流
- 结构：Logo | 搜索框（`sm:ml-auto sm:max-w-md`）| 主题开关；**打字机在其下方独立一行居中**

### 4. 背景装饰
- 樱花花瓣飘落 + 星星闪烁；**仅星星可加弱视差**，系数 `0.1 ~ 0.2`（本项目 0.15），位移封顶 ≤72px
- 视差写在**外层定位 wrapper**，动画 transform 写在内层，不同节点
- 卡片 / 导航栏 / 标签栏 **一律禁止视差位移**

## 二、主题系统（CSS 变量驱动）
- `tailwind.config.js`：`darkMode: 'class'`，`colors.food.*` 全部映射为 `var(--food-*)`，`boxShadow.*` 映射为 `var(--shadow-*)`
- `index.css`：`:root` 定义亮色变量，`html.dark` 覆盖暗系紫黑变量；首屏闪烁用 `index.html` 内联脚本提前加 `dark` 类
- 开关：`ThemeToggle`（右上角，移动端 `absolute right-3 top-3`，桌面 `sm:static`），状态存 `food-nav:theme`
- 关键暗色 token：bg `#16101F`、surface `#241A33`、line `#3E2F55`、text `#F6EDFD`、primary `#FF8FB8`、滚动条 `#7A5C9E/#221A2E`
- 规则：**组件里禁止写死颜色**，一律用 `food-*` token 或 `dark:` 变体（半透明色才用 `dark:`）

## 三、组件规范

### TypeWriterQuote（打字机暖心句子）
- 文件：`src/components/TypeWriterQuote.tsx`，props：`className?`
- 接口：`https://quote.shiora.cc/api/hitokoto?type=a`（type=a = 动漫分类）
- **CORS 排查结论**：源站不返回 `Access-Control-Allow-Origin`，浏览器直连 200 OK 也读不到数据
  解决链：`VITE_QUOTE_PROXY`（Cloudflare Worker，`worker/` 目录）→ 本地开发走 Vite 同源代理 `/quote-api` → 都失败才用本地兜底
- 读取：`response.text()` + `JSON.parse`（容错 BOM），失败再用正则抠 `hitokoto`，全程 `console.log/console.error` 打印状态与异常
- 容错：3s AbortController 超时；失败轮询 6 条本地动漫句，**任何时刻不空白**
- 动画：**70ms/字**（按 `Array.from` 码点切分防 emoji 乱码）→ 停留 **20s** → 自动切下一句
- 样式：`text-sm text-pink-500/80 dark:text-pink-400/80 italic`，`「」`包裹，**`min-h-[46px] + line-clamp-2` 固定占位防跳动**
- 位置：**搜索框下方独立一行，桌面/移动端统一垂直排版 + 居中**（不再与搜索框同行挤压）

### LazyCard（卡片懒加载）
- `src/components/LazyCard.jsx`，包在 NavCard 外，只改一行渲染
- `useLayoutEffect` 同步预检视口 ±240px → 首屏零闪烁；更远的渲染等高骨架，`IntersectionObserver rootMargin '240px 0px'` 进入才替换
- 容器 `className="grid"`：撑满列宽 + 同排等高；骨架与卡片同构（图区 h-[120px]/md:h-[140px]、标题 h-6、描述 h-[45px]）

### 卡片交互（NavCard）
- 根元素为 `div.food-card`，内部 `absolute inset-0 z-0` 的 `<a>` 作为整卡热区（保证按钮可嵌套、HTML 合法）
- 收藏：右上角爱心 MorphIcon（`z-20`，`aria-pressed`，激活时 `fill=currentColor`），数据存 `food-nav:favorites`
- 复制：右下角按钮 `opacity-0 group-hover:opacity-100 focus-visible:opacity-100`，成功弹 `showToast('复制成功 ♡')`
- 装饰 `✦` 移到左下角，避免与爱心抢位

### 其他组件
- `ToastHost`：挂在 Layout，`fixed bottom-6 left-1/2 z-50`，`animate-toast-in 200ms ease-out`，2s 自动消失
- `EmptyTip`：樱花五瓣 SVG（5 个 ellipse 旋转 72°）+ 主副文案，支持 `title/desc` props（空收藏态复用）
- `NotFound`：`food-card` 贴纸卡 + 樱花插画 + 404 + 返回首页按钮；`App.jsx` 按 `location.pathname` 归一化路由

### 本地存储约定（全部走 `src/utils/storage.js`，读写 try/catch 降级）
| Key | 内容 |
| --- | --- |
| `food-nav:theme` | `light` / `dark` |
| `food-nav:category` | 当前分类 key（含虚拟 `favorites`） |
| `food-nav:favorites` | 收藏卡片 name 数组（JSON） |

## 四、动画参数速查表

| 场景 | 参数 |
| --- | --- |
| 卡片 hover | `rotate(-3deg) scale(1.02)` / `200ms ease` |
| 导航栏毛玻璃 | `300ms ease-out`，圆角 28px↔20px |
| 打字机 | `70ms/字`，停留 `20s`，超时 `3s` |
| 懒加载视口余量 | `rootMargin: 240px 0px` |
| 背景星星视差 | 系数 `0.15`，上限 `72px`，rAF 节流 |
| toast | `toast-in 200ms ease-out`，停留 `2000ms` |
| 樱花飘落 / 星星闪烁 | 沿用 `petal-fall` / `twinkle` |

## 五、性能规范
1. 卡片一律 Intersection Observer 懒加载，首屏外不渲染真实 DOM
2. 滚动监听 `passive` + rAF 合帧，禁止 scroll 回调同步 setState
3. `html { overflow-y: scroll }` 永久占位，杜绝滚动条引发的横向抖动
4. 新增组件独立成文件，业务页面只改必要接线；主题色只写变量不写死

## 六、禁止清单（❌）
- ❌ 卡片、导航栏、标签栏添加视差位移；视差系数 > 0.2 或飘出视口
- ❌ 高饱和配色、闪烁、强弹跳、大幅位移动画
- ❌ 修改 / 去除卡片硬偏移阴影与粉描边，改成扁平风
- ❌ 组件里写死主题色（必须 token / `dark:` 变体）
- ❌ 打字机空白、光标闪烁、布局跳动；接口失败直接报错不兜底
- ❌ 空分类留白区域；本地存储读写不加降级保护
- ❌ `any` 逃逸破坏 TS 类型；破坏干净治愈的安静氛围感
