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
  'HTMLInputElement',
  'HTMLTextAreaElement',
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

// fetch mock：返回与线上一致的动漫分类句子
const fetchCalls = []
const REMOTE_QUOTE = '今天的风也甜甜的，像刚出炉的舒芙蕾。'
window.fetch = async (url) => {
  fetchCalls.push(String(url))
  await new Promise((resolve) => setTimeout(resolve, 120))
  return {
    ok: true,
    status: 200,
    type: 'basic',
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify({ hitokoto: REMOTE_QUOTE, type: 'a' }),
    json: async () => ({ hitokoto: REMOTE_QUOTE, type: 'a' }),
  }
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
check(
  'dev uses same-origin vite proxy (CORS fix)',
  fetchCalls.length > 0 && fetchCalls.every((u) => u.includes('/quote-api/')),
  fetchCalls[0],
)
check('remote anime quote typed out', quoteText().includes('舒芙蕾'), quoteText())
check('quote min-height placeholder', !!q('p.min-h-\\[46px\\]'))
check(
  'quote text-sm + pink-500/80',
  !!q('p.italic')?.className.includes('text-sm') &&
    !!q('p.italic')?.className.includes('text-pink-500/80'),
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

console.log(`\nRESULT: ${passed} passed / ${failed} failed`)
unmount()
await server.close()
await dom.window.close()
process.exit(failed > 0 ? 1 : 0)
