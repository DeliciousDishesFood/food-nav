import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://food-nav.test/',
  pretendToBeVisual: true,
})
const { window } = dom
global.window = window
global.document = window.document
try {
  global.navigator = window.navigator
} catch {
  /* Node 24 global.navigator 只读 */
}
for (const key of [
  'HTMLElement',
  'Element',
  'Node',
  'CustomEvent',
  'Event',
  'MouseEvent',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'MutationObserver',
  'getComputedStyle',
]) {
  if (window[key]) global[key] = window[key]
}
global.requestAnimationFrame = window.requestAnimationFrame.bind(window)
global.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
global.IS_REACT_ACT_ENVIRONMENT = false

// 剪贴板 mock
const copied = []
Object.defineProperty(window.navigator, 'clipboard', {
  value: { writeText: async (text) => copied.push(text) },
  configurable: true,
})
Object.defineProperty(global, 'navigator', {
  value: window.navigator,
  configurable: true,
})

// M9：种 fv_id cookie（与 functions/_middleware.js 同名的一年期匿名访客标识），
// 收藏同步层据此走 PUT/DELETE 服务端路径（mock 不做签名校验）
window.document.cookie = 'fv_id=verify-visitor-0001; path=/'

// IntersectionObserver stub：手动 fire，验证懒加载分支
class IO {
  constructor(cb) {
    this.cb = cb
    this.disconnected = false
    this.el = null
    IO.instances.push(this)
  }
  observe(el) {
    this.el = el
  }
  disconnect() {
    this.disconnected = true
  }
  unobserve() {}
}
IO.instances = []
IO.fireAll = () => {
  for (const io of IO.instances) {
    if (!io.disconnected && io.el) {
      io.cb([{ isIntersecting: true, target: io.el }])
    }
  }
}
IO.reset = () => {
  IO.instances = []
}
global.IntersectionObserver = IO
window.IntersectionObserver = IO

// 模拟“卡片在视口外 5000px”，确保走 Intersection Observer 分支
const origRect = window.Element.prototype.getBoundingClientRect
window.Element.prototype.getBoundingClientRect = function patched() {
  if (this && this.dataset && this.dataset.lazy === 'card') {
    return {
      top: 5000,
      bottom: 5240,
      left: 0,
      right: 300,
      width: 300,
      height: 240,
      x: 0,
      y: 5000,
    }
  }
  return origRect.call(this)
}

// fetch mock：按路径路由
//   /quote-api/ → 原动漫一言（原断言语义保留）
//   /api/       → M1 后端导航接口（与 navSources 同构的站点数据）
//   /api/favorites → M9 收藏同步（GET 初始化 / PUT 收藏 / DELETE 取消；mock 不模拟签名校验）
const fetchCalls = []
/** 方法级记录（M9 断言区分 GET/PUT/DELETE），URL 语义与 fetchCalls 一致 */
const fetchOps = []
const REMOTE_QUOTE = '今天的风也甜甜的，像刚出炉的舒芙蕾。'
const delayMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 后端返回的数据：分类取自 getCategoryList，站点取自 navSource（最后一站改名作 API 探针）
const { navSource: MOCK_NAV, getCategoryList: MOCK_GET_CATEGORY_LIST } =
  await import('../src/data/navSources.js')
const API_MARKER = 'API同步演示站'
const API_CATEGORIES = MOCK_GET_CATEGORY_LIST()
  .filter((tab) => tab.key !== 'all')
  .map((tab, index) => ({
    id: index + 1,
    key: tab.key,
    name: tab.label,
    icon: tab.icon,
    sortOrder: index,
  }))
const API_SITES = []
MOCK_NAV.forEach((group, groupIndex) => {
  let sortOrder = 0
  group.items.forEach((item) => {
    API_SITES.push({
      id: API_SITES.length + 1,
      categoryId: groupIndex + 1,
      categoryKey: group.categoryKey,
      name: item.name,
      desc: item.desc,
      url: item.url,
      icon: item.icon,
      coverImg: item.coverImg || '',
      tag: item.tag || '',
      sortOrder,
      status: 'active',
      heatScore: 0,
    })
    sortOrder += 1
  })
})
API_SITES[API_SITES.length - 1].name = API_MARKER

// M5：AI 问答 SSE 流（ok → 完整三段：content / recommend / [DONE]；fail → 429 限流信封）
const AI_SSE =
  'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n' +
  'event: recommend\ndata: {"sites":[]}\n\n' +
  'data: [DONE]\n\n'
const sseResp = (text, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  type: 'basic',
  headers: {
    get: (name) =>
      String(name).toLowerCase() === 'content-type' ? 'text/event-stream' : 'application/json',
  },
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  }),
  text: async () => text,
  json: async () => ({ ok: false, error: { code: 'bad_response', message: 'sse' } }),
})

const jsonResp = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  type: 'basic',
  headers: { get: () => 'application/json' },
  text: async () => JSON.stringify(payload),
  json: async () => payload,
})

// apiMode: 'ok' → 正常返回后端数据；'fail' → 模拟断网（场景 9 降级）
// API_OK_DELAY_MS 故意放慢：首帧先用 navSources 快照渲染（不白屏），随后无缝替换后端数据
let apiMode = 'ok'
const QUOTE_DELAY_MS = 120
const API_OK_DELAY_MS = 1500
const API_FAIL_DELAY_MS = 200

window.fetch = async (url, options = {}) => {
  const method = String((options && options.method) || 'GET').toUpperCase()
  fetchCalls.push(String(url))
  fetchOps.push({ method, url: String(url) })
  const u = String(url)
  if (u.includes('/quote-api/')) {
    await delayMs(QUOTE_DELAY_MS)
    return jsonResp({ hitokoto: REMOTE_QUOTE, type: 'a' })
  }
  // M9：收藏同步（快速返回；与读接口同口径受 apiMode 控制 → 断网时同步层静默降级纯本地）
  if (u.includes('/api/favorites')) {
    if (apiMode !== 'ok') throw new Error('network down')
    if (method === 'GET') return jsonResp({ ok: true, data: [] })
    if (method === 'PUT') return jsonResp({ ok: true, favorited: true })
    if (method === 'DELETE') return jsonResp({ ok: true, favorited: false })
    return jsonResp({ ok: false, error: { code: 'method_not_allowed', message: 'method' } }, 405)
  }
  // M2：登录接口（快速返回，不走 1500ms 的读接口延迟）
  if (u.includes('/api/admin/login')) {
    await delayMs(60)
    if (apiMode !== 'ok') {
      return jsonResp(
        { ok: false, error: { code: 'invalid_password', message: '密码错误' } },
        401,
      )
    }
    return jsonResp({
      ok: true,
      data: { token: 'test-token', expiresAt: Date.now() + 8 * 60 * 60 * 1000 },
    })
  }
  // M4：埋点上报 + 访问统计（快速返回，不走读接口的 1.5s 延迟）
  if (u.includes('/api/track/')) {
    return jsonResp({ ok: true, data: { counted: true } })
  }
  // M5：AI 问答（SSE 流；apiMode=fail → 429 限流信封）
  if (u.includes('/api/ai/chat')) {
    if (apiMode !== 'ok') {
      return jsonResp(
        { ok: false, error: { code: 'rate_limited', message: '提问太频繁了，请 1 分钟后再试' } },
        429,
      )
    }
    return sseResp(AI_SSE)
  }
  if (u.includes('/api/stats/visits')) {
    return jsonResp({
      ok: true,
      data: { list: [{ date: '2026-10-05', uv: 3 }], days: 30 },
    })
  }
  if (u.includes('/api/')) {
    await delayMs(apiMode === 'ok' ? API_OK_DELAY_MS : API_FAIL_DELAY_MS)
    if (apiMode === 'fail') throw new Error('network down')
    if (u.includes('/api/categories')) {
      return jsonResp({ ok: true, data: API_CATEGORIES })
    }
    if (u.includes('/api/sites')) {
      return jsonResp({ ok: true, data: API_SITES })
    }
    return jsonResp({ ok: true, data: [] })
  }
  await delayMs(QUOTE_DELAY_MS)
  return jsonResp({ hitokoto: REMOTE_QUOTE, type: 'a' })
}
global.fetch = window.fetch

const { createServer } = await import('vite')
const root = process.cwd()
const server = await createServer({
  root,
  configFile: `${root}/vite.config.js`,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const { createElement } = await import('react')
const { createRoot } = await import('react-dom/client')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let passed = 0
let failed = 0
function check(name, condition, extra = '') {
  if (condition) {
    passed += 1
    console.log(`  ok  ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL ${name}${extra ? ` -> ${extra}` : ''}`)
  }
}

async function loadApp() {
  const mod = await server.ssrLoadModule('/src/App.jsx')
  return mod.default
}

let container = null
let reactRoot = null
async function mount(App) {
  container = document.createElement('div')
  document.body.appendChild(container)
  reactRoot = createRoot(container)
  reactRoot.render(createElement(App))
  await sleep(120)
}
function unmount() {
  reactRoot.unmount()
  container.remove()
  container = null
  reactRoot = null
}

const q = (sel) => container.querySelector(sel)
const qa = (sel) => [...container.querySelectorAll(sel)]
const tabs = () => qa('main button')
const realCards = () => qa('.food-card a[href^="http"]').length
const skeletons = () => qa('div.food-card[aria-hidden]').length
const quoteText = () => {
  const p = qa('p').find((el) => el.className.includes('italic'))
  if (!p) return ''
  // 只取 aria-hidden 的打字区（「」+ 动态文本），排除 sr-only 整句播报
  const visible = [...p.querySelectorAll('span[aria-hidden="true"]')]
    .map((span) => span.textContent)
    .join('')
  return visible || p.textContent
}
const typedOf = (text) => text.slice(1, -1)
const setInput = (value) => {
  const input = q('input[type="search"]')
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set
  setter.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
}
const findTab = (label) => tabs().find((b) => b.textContent.includes(label))
const settle = async (times = 3) => {
  for (let i = 0; i < times; i += 1) {
    IO.fireAll()
    await sleep(120)
  }
}

/** 轮询等待条件成立（懒加载 chunk / 异步渲染用），超时返回 null */
const waitFor = async (probe, timeoutMs = 8000) => {
  const start = Date.now()
  for (;;) {
    const value = probe()
    if (value) return value
    if (Date.now() - start > timeoutMs) return null
    await sleep(60)
  }
}

/* ===== 场景 1：首屏 ===== */
console.log('\n[1] first paint: lazy skeleton / typewriter / api')
let App = await loadApp()
await mount(App)
check('active tab is all', tabs()[0]?.className.includes('bg-food-primary'))
check('23 skeletons offscreen', skeletons() === 23, `got ${skeletons()}`)
check('no real card yet', realCards() === 0, `got ${realCards()}`)
await settle()
check('23 real cards after IO', realCards() === 23, `got ${realCards()}`)
check('skeletons replaced', skeletons() === 0, `got ${skeletons()}`)

const samples = []
for (let i = 0; i < 10; i += 1) {
  samples.push(quoteText())
  await sleep(250)
}
const grows = samples.some(
  (s, i) =>
    i > 0 &&
    typedOf(s).length > typedOf(samples[i - 1]).length &&
    typedOf(s).startsWith(typedOf(samples[i - 1])) &&
    typedOf(s) !== typedOf(samples[i - 1]),
)
check(
  'typewriter grows per char',
  grows,
  samples.map((s) => typedOf(s).length).join(','),
)
check(
  'quote api called with type=a',
  fetchCalls.some((u) => u.includes('hitokoto?type=a')),
  fetchCalls[0],
)
// 原断言「dev 同源代理修复 CORS」语义保留：一言请求必须逐条走同源 /quote-api/ 代理。
// M1 起新增 /api/* 导航接口调用，故改为只对一言调用做 every 校验。
const quoteCalls = fetchCalls.filter((u) => u.includes('hitokoto'))
check(
  'dev uses same-origin vite proxy (CORS fix)',
  quoteCalls.length > 0 && quoteCalls.every((u) => u.includes('/quote-api/')),
  quoteCalls[0] || fetchCalls[0],
)
check('remote anime quote typed out', quoteText().includes('舒芙蕾'), quoteText())
check('quote min-height placeholder', !!q('p.min-h-\\[46px\\]'))
check(
  'quote text-sm + pink-500/80',
  !!q('p.italic')?.className.includes('text-sm') &&
    !!q('p.italic')?.className.includes('text-pink-500/80'),
)

// 新增断言 ①（40 → 42）：API 数据接入成功
// mock 后端数据最后一站改名为 API_MARKER，DOM 出现该名 = 卡片确实来自 /api/ 而非本地快照
await settle()
check(
  'api data rendered from mock /api/',
  fetchCalls.some((u) => u.includes('/api/')) &&
    (container.textContent || '').includes(API_MARKER),
  `apiCalls=${fetchCalls.filter((u) => u.includes('/api/')).length}`,
)

// 新增断言 M6（47 → 48）：API 成功后写入 localStorage 导航缓存
// （food-nav:nav-cache，{savedAt, groups} 结构，含真实站点 → 回主页首帧无 swap）
let navCache = null
try {
  navCache = JSON.parse(window.localStorage.getItem('food-nav:nav-cache') || 'null')
} catch {
  navCache = null
}
check(
  'nav cache written after api success',
  Boolean(navCache) &&
    typeof navCache.savedAt === 'number' &&
    Array.isArray(navCache.groups) &&
    navCache.groups.some(
      (group) => Array.isArray(group.items) && group.items.some((item) => item.name === API_MARKER),
    ),
  String(window.localStorage.getItem('food-nav:nav-cache') || 'null').slice(0, 160),
)

/* ===== 场景 2：主题切换 ===== */
console.log('\n[2] dark mode toggle')
const themeButton = qa('header button').find((b) =>
  (b.getAttribute('aria-label') || '').includes('主题'),
)
check('theme toggle in header', !!themeButton)
themeButton.click()
await sleep(80)
check('html.dark on', document.documentElement.classList.contains('dark'))
check(
  'theme saved to localStorage',
  window.localStorage.getItem('food-nav:theme') === 'dark',
  String(window.localStorage.getItem('food-nav:theme')),
)
check('data-theme=dark', document.documentElement.getAttribute('data-theme') === 'dark')
themeButton.click()
await sleep(80)
check(
  'toggle back to light',
  !document.documentElement.classList.contains('dark') &&
    window.localStorage.getItem('food-nav:theme') === 'light',
)
themeButton.click()
await sleep(80)
check('dark kept for reload test', document.documentElement.classList.contains('dark'))

/* ===== 场景 3：收藏 ===== */
console.log('\n[3] favorites: empty state / toggle / tab')
findTab('我的收藏').click()
await sleep(150)
check('empty favorites shows EmptyTip', (container.textContent || '').includes('还没有收藏的小站'))
check(
  'category saved',
  window.localStorage.getItem('food-nav:category') === 'favorites',
  String(window.localStorage.getItem('food-nav:category')),
)

findTab('全部').click()
await sleep(150)
await settle()
const heartButtons = qa('button[aria-pressed]')
check('heart on every card', heartButtons.length === 23, `got ${heartButtons.length}`)
heartButtons[0].click()
await sleep(80)
check(
  'favorite written to localStorage',
  JSON.parse(window.localStorage.getItem('food-nav:favorites') || '[]').includes('下厨房'),
  String(window.localStorage.getItem('food-nav:favorites')),
)
check('heart pressed state', heartButtons[0].getAttribute('aria-pressed') === 'true')
heartButtons[0].click()
await sleep(60)
check(
  'unfavorite removes entry',
  JSON.parse(window.localStorage.getItem('food-nav:favorites') || '[]').length === 0,
)
heartButtons[0].click()
await sleep(60)

findTab('我的收藏').click()
await sleep(150)
await settle()
check('favorites tab shows only 1 card', realCards() === 1, `got ${realCards()}`)

/* ===== 场景 3B：M9 收藏服务端同步 + 点击热度上报（改 1 增 2 → 52） ===== */
console.log('\n[3B] M9 favorites server sync (PUT/DELETE) + click report (50 -> 52)')

// 新增断言 ①（50 → 52）：App 挂载即 GET /api/favorites（同步初始化，mock 回空历史）
check(
  'favorites sync init calls GET /api/favorites',
  fetchOps.some((op) => op.method === 'GET' && op.url.includes('/api/favorites')),
  fetchOps
    .filter((op) => op.url.includes('/api/favorites'))
    .map((op) => `${op.method} ${op.url}`)
    .join(' | ') || 'none',
)

// 真实用户路径：回到「全部」列表点爱心（收藏 tab 会把卡片移除导致节点脱离，不能在那儿点）
findTab('全部').click()
await sleep(150)
await settle(2)
const syncHeart = qa('button[aria-pressed]')[0]
const syncMark = fetchOps.length
const favOpsAfter = (mark) =>
  fetchOps
    .slice(mark)
    .filter((op) => op.url.includes('/api/favorites/'))
    .map((op) => `${op.method} ${op.url}`)

if (syncHeart) {
  // 场景 3 末态为「已收藏」→ 先取消复位（顺带产生 DELETE 证据），再走「收藏 → 取消 → 收藏」
  syncHeart.click()
  await sleep(160)
}
// 改 1：原「aria-pressed false→true → /api/track/favorite 上报」（M9 已停用防双计）
// 改为真实点按钮 → PUT /api/favorites/:id（带 X-Fav-Sign + visitor_id），再点取消 → DELETE
if (syncHeart) {
  syncHeart.click()
  await sleep(160)
}
if (syncHeart) {
  syncHeart.click()
  await sleep(160)
}
if (syncHeart) {
  syncHeart.click() // 恢复「已收藏」（场景 7 的 reload 断言依赖此状态）
  await sleep(160)
}
const syncOps = favOpsAfter(syncMark)
check(
  'favorite toggled via PUT/DELETE /api/favorites/{id} (real button click)',
  syncOps.some((entry) => entry.startsWith('PUT ')) &&
    syncOps.some((entry) => entry.startsWith('DELETE ')),
  syncOps.join(' | ') || 'none',
)

// 新增断言 ②（50 → 52）：收藏后本地 food-nav:favorites 含该站点（乐观更新与服务端同步并存）
check(
  'favorite written to local storage alongside server sync',
  JSON.parse(window.localStorage.getItem('food-nav:favorites') || '[]').includes('下厨房'),
  String(window.localStorage.getItem('food-nav:favorites')),
)

// 切回全部列表，对真实卡片派发外链点击（App.jsx 捕获阶段全局委托）
const trackLink = qa('.food-card a[href^="http"]')[0]
if (trackLink) {
  const preventNav = (event) => event.preventDefault()
  trackLink.addEventListener('click', preventNav)
  trackLink.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  trackLink.removeEventListener('click', preventNav)
  await sleep(150)
}
// 新增断言 ②（45 → 47）：点击卡片外链 → 上报点击热度
check(
  'click reported to /api/track/click',
  Boolean(trackLink) && fetchCalls.some((u) => u.includes('/api/track/click')),
  fetchCalls.filter((u) => u.includes('/api/track/')).join(' | ') || 'none',
)

/* ===== 场景 4：本地模糊搜索 ===== */
console.log('\n[4] local fuzzy search')
findTab('全部').click()
await sleep(150)
setInput('咖啡')
await sleep(150)
await settle(2)
const matched = realCards()
check('search filters live', matched > 0 && matched < 23, `got ${matched}`)
setInput('zzzz-not-exist-zzzz')
await sleep(150)
check('no match renders EmptyTip', (container.textContent || '').includes('餐盘空空如也'))
setInput('')
await sleep(150)
await settle(2)
check('clear restores all cards', realCards() === 23, `got ${realCards()}`)

/* ===== 场景 5：分类记忆 ===== */
console.log('\n[5] category memory')
findTab('烘焙甜点').click()
await sleep(150)
check(
  'category written to localStorage',
  window.localStorage.getItem('food-nav:category') === 'baking-dessert',
  String(window.localStorage.getItem('food-nav:category')),
)
await settle(2)
check('baking tab shows 5 cards', realCards() === 5, `got ${realCards()}`)

/* ===== 场景 6：复制链接 + toast ===== */
console.log('\n[6] copy link + toast')
const copyButton = qa('button[aria-label^="复制"]')[0]
check('copy button exists', !!copyButton)
copyButton.click()
await sleep(150)
check('clipboard written', copied.length > 0 && copied[0].startsWith('http'), JSON.stringify(copied))
check('success toast shown', (container.textContent || '').includes('复制成功'), q('[role="status"]')?.textContent ?? 'no toast')

/* ===== 场景 7：模拟刷新 ===== */
console.log('\n[7] reload keeps state')
unmount()
IO.reset()
document.documentElement.classList.remove('dark')
if (typeof server.moduleGraph?.invalidateAll === 'function') {
  server.moduleGraph.invalidateAll()
}
App = await loadApp()
const storageMod = await server.ssrLoadModule('/src/utils/storage.js')
check(
  'storage round-trip reads favorites back',
  storageMod.readList(storageMod.STORAGE_KEYS.favorites).includes('下厨房'),
  JSON.stringify(storageMod.readList(storageMod.STORAGE_KEYS.favorites)),
)
await mount(App)
await sleep(200)
check('dark theme restored after reload', document.documentElement.classList.contains('dark'))
const activeTab = tabs().find((b) => b.className.includes('bg-food-primary'))
check('category restored after reload', (activeTab?.textContent ?? '').includes('烘焙甜点'), activeTab?.textContent ?? 'none')
check(
  'favorites survive reload',
  JSON.parse(window.localStorage.getItem('food-nav:favorites') || '[]').includes('下厨房'),
)
await settle()
findTab('我的收藏').click()
await sleep(150)
await settle(2)
check('favorites tab after reload shows 1 card', realCards() === 1, `got ${realCards()}`)

/* ===== 场景 8：404 ===== */
console.log('\n[8] 404 page')
unmount()
window.history.pushState({}, '', '/lost-page')
App = await loadApp()
await mount(App)
check('unknown path renders 404', (container.textContent || '').includes('404'))
check(
  'back home button',
  !!qa('a[href="#/"]').find((a) => a.textContent.includes('回到首页')),
)
check('404 uses sticker card', !!q('.food-card'))

/* ===== 场景 9：API 失败降级 ===== */
console.log('\n[9] api failure → local snapshot fallback (no white screen)')
// M6：先清 nav-cache，验证「无缓存时接口失败 → 快照 + 降级条」这条原语义
//（有缓存时 M6 规则是继续用缓存不弹条，属新增能力，另由本场景之外的 48 号断言覆盖）
window.localStorage.removeItem('food-nav:nav-cache')
apiMode = 'fail'
unmount()
window.history.pushState({}, '', '/')
if (typeof server.moduleGraph?.invalidateAll === 'function') {
  server.moduleGraph.invalidateAll()
}
App = await loadApp()
await mount(App)
findTab('全部').click()
await sleep(150)
await settle()
// 新增断言 ②（40 → 42）：接口抛错 → 降级 navSources 快照 + 顶部提示条，页面不白屏
check(
  'api failure falls back to snapshot (no white screen)',
  realCards() === 23 &&
    !(container.textContent || '').includes(API_MARKER) &&
    (container.textContent || '').includes('本地快照'),
  `cards=${realCards()}`,
)

/* ===== 场景 10：管理面板（M2 新增 3 条 → 42 → 45） ===== */
console.log('\n[10] admin panel: #/admin route / login / sites data source')
apiMode = 'ok'
unmount()
window.localStorage.removeItem('food-nav:admin-token')
window.history.pushState({}, '', '/')
window.location.hash = '#/admin'
App = await loadApp()
await mount(App)

// 新增断言 ①（42 → 45）：#/admin 路由可达，无 token → 渲染登录页（等 React.lazy chunk 就绪）
const passwordInput = await waitFor(() => q('input[type="password"]'), 8000)
check('/admin route renders login page', !!passwordInput)

// 新增断言 ②（42 → 45）：模拟登录成功 → 面板可见 + token 写入 localStorage
if (passwordInput) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set
  valueSetter.call(passwordInput, 'admin-pass-123')
  passwordInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  await sleep(80)
  const loginForm = q('form')
  if (loginForm) {
    loginForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  }
}
const shellText = await waitFor(
  () => ((container.textContent || '').includes('登出') ? container.textContent : null),
  8000,
)
let storedToken = null
try {
  storedToken = JSON.parse(window.localStorage.getItem('food-nav:admin-token') || 'null')
} catch {
  storedToken = null
}
check(
  'login success renders admin shell + token saved',
  Boolean(shellText) &&
    !q('input[type="password"]') &&
    !!storedToken &&
    storedToken.token === 'test-token',
  `shell=${Boolean(shellText)} token=${JSON.stringify(storedToken)}`,
)

// 新增断言 ③（42 → 45）：管理面板站点列表来自 /api/sites?status=all
await sleep(300)
check(
  'admin sites list fetched from /api/sites?status=all',
  fetchCalls.some((u) => u.includes('/api/sites') && u.includes('status=all')),
  fetchCalls.filter((u) => u.includes('/api/sites')).join(' | ') || 'none',
)

/* ===== 场景 11：M5 AI 问答（47 → 49，新增 2 条） ===== */
console.log('\n[11] ask: home entry button + #/ask lazy route')
apiMode = 'ok'
unmount()
IO.reset()
window.history.pushState({}, '', '/')
if (typeof server.moduleGraph?.invalidateAll === 'function') {
  server.moduleGraph.invalidateAll()
}
App = await loadApp()
await mount(App)
await settle()

const askEntry = qa('button').find((b) => (b.textContent || '').includes('问问樱见'))
// 新增断言 ①（47 → 49）：HomePage 出现「问问樱见」入口按钮（M8 品牌改名，语义不变）
check('home shows ask entry button', Boolean(askEntry), 'entry button not found')

if (askEntry) askEntry.click()
// 懒加载 chunk：等待 /ask 渲染出提问输入框（动态 import 需 await）
const askInput = await waitFor(() => q('textarea'), 8000)
// 新增断言 ②（47 → 49）：#/ask 路由可达且渲染出输入框
check('/ask route renders composer', Boolean(askInput), 'composer not found')

// 流式冒烟（不新增断言）：发送 → mock SSE 累积 → 收尾渲染
if (askInput) {
  const areaSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  ).set
  areaSetter.call(askInput, '有什么推荐？')
  askInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  await sleep(80)
  const sendButton = qa('button').find((b) => (b.textContent || '').includes('发送'))
  if (sendButton) sendButton.click()
  const streamed = await waitFor(() => ((container.textContent || '').includes('你好') ? true : null), 8000)
  console.log(`  streaming smoke: ${streamed ? 'ok' : 'timeout'}`)
}

console.log(`\nRESULT: ${passed} passed / ${failed} failed`)
unmount()
await server.close()
await dom.window.close()
process.exit(failed > 0 ? 1 : 0)
