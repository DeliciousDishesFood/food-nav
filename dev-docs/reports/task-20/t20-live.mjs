// task-20 · M10 部署上线 —— 线上 CDP 回归脚本
// 访问 https://food-nav.shiora.cc（线上，部署 42835c8a 之后；非本地 pages dev）
// 用法：node dev-docs/reports/task-20/t20-live.mjs
// 前置：Edge 以 --remote-debugging-port=9222 + 独立 --user-data-dir 启动（窗口保持可见/前台）
// 安全：ADMIN_PASSWORD 运行时从 .dev.vars（已 .gitignore）读取，不写入本文件
// 约束：不污染线上数据 —— 收藏测完取消还原、会话/主题/admin token 收尾清理
// 证据：acceptance-log.txt · 01~05 截图
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const BASE = 'https://food-nav.shiora.cc'
const CDP = 'http://127.0.0.1:9222'
const ROOT = 'E:/react/food-nav'
const OUT = `${ROOT}/dev-docs/reports/task-20`

/* ================= 密钥读取（不落仓库） ================= */
async function readDevVar(name) {
  try {
    const raw = await readFile(`${ROOT}/.dev.vars`, 'utf8')
    const m = new RegExp(`^${name}=(.*)$`, 'm').exec(raw)
    return m ? m[1].trim() : ''
  } catch {
    return ''
  }
}
const ADMIN_PASS = await readDevVar('ADMIN_PASSWORD')
if (!ADMIN_PASS) {
  console.error('FATAL: .dev.vars 缺少 ADMIN_PASSWORD')
  process.exit(1)
}

/* ================= 断言与日志 ================= */
const results = []
const notes = []
let pass = 0
let fail = 0
function check(name, cond, extra = '') {
  const line = cond ? `  ok  ${name}` : `  FAIL ${name}${extra ? ` -> ${extra}` : ''}`
  if (cond) pass += 1
  else fail += 1
  results.push(line)
  console.log(line)
}
const note = (text) => {
  notes.push(text)
  console.log(`  ·   ${text}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function writeLog(tag = '') {
  const lines = [
    'task-20 · M10 部署上线 · 线上 CDP 回归日志',
    `base: ${BASE}`,
    `time: ${new Date().toISOString()} ${tag}`,
    '',
    ...results,
    '',
    ...notes.map((n) => `# ${n}`),
    '',
    `RESULT: ${pass} passed / ${fail} failed`,
  ]
  try {
    await writeFile(`${OUT}/acceptance-log.txt`, lines.join('\n'), 'utf8')
  } catch {
    /* ignore */
  }
}

/* ================= CDP harness ================= */
let targets = await (await fetch(`${CDP}/json/list`)).json()
let target = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'))
if (!target) {
  target = await (
    await fetch(`${CDP}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
  ).json()
}
console.log(`CDP target: ${target.url}`)

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = (e) => reject(new Error(`ws connect failed: ${e.message || e}`))
})
let msgId = 0
const pending = new Map()
const eventListeners = []
ws.onmessage = (event) => {
  const msg = JSON.parse(String(event.data))
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)))
    else resolve(msg.result)
  } else if (msg.method) {
    for (const fn of eventListeners) fn(msg)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = (msgId += 1)
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
const onEvent = (fn) => eventListeners.push(fn)

/* ================= 网络日志（收藏 PUT/DELETE 证据） ================= */
const netlog = []
const reqIndex = new Map()
onEvent((msg) => {
  if (msg.method === 'Network.requestWillBeSent') {
    const r = msg.params.request
    const entry = {
      id: msg.params.requestId,
      url: r.url,
      method: r.method,
      headers: r.headers || {},
      postData: r.postData || '',
      status: null,
      contentType: '',
    }
    netlog.push(entry)
    reqIndex.set(entry.id, entry)
  } else if (msg.method === 'Network.responseReceived') {
    const entry = reqIndex.get(msg.params.requestId)
    if (entry) {
      entry.status = msg.params.response.status
      const headers = msg.params.response.headers || {}
      entry.contentType = headers['content-type'] || headers['Content-Type'] || ''
    }
  }
})
const sliceFrom = (mark) => netlog.slice(mark)
const favSince = (mark) => sliceFrom(mark).filter((r) => r.url.includes('/api/favorites'))

/* ================= 通用工具 ================= */
const waitFor = async (probe, timeoutMs = 10000) => {
  const start = Date.now()
  for (;;) {
    let value = null
    try {
      value = await probe()
    } catch {
      value = null
    }
    if (value) return value
    if (Date.now() - start > timeoutMs) return null
    await sleep(150)
  }
}
const evaluate = async (expression, awaitPromise = false) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
  if (res.exceptionDetails) {
    throw new Error(
      `evaluate failed: ${JSON.stringify(res.exceptionDetails.exception || res.exceptionDetails.text)}`,
    )
  }
  return res.result ? res.result.value : undefined
}
const poll = (expression, timeoutMs = 10000) => waitFor(() => evaluate(expression), timeoutMs)

const navigate = async (url) => {
  const want = new URL(url)
  await send('Page.navigate', { url })
  const ok = await waitFor(async () => {
    const state = await evaluate(`({ href: location.href, ready: document.readyState })`)
    if (!state) return false
    let cur
    try {
      cur = new URL(state.href)
    } catch {
      return false
    }
    return (
      cur.origin === want.origin && cur.pathname === want.pathname && state.ready === 'complete'
    )
  }, 25000)
  if (!ok) note(`navigate slow/timeout: ${url}`)
  await sleep(500)
}
const goHash = async (hash) => {
  await evaluate(`(() => { window.location.hash = ${JSON.stringify(hash)}; return true })()`)
  await sleep(600)
}
const setViewport = (width, height, mobile = false) =>
  send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile,
  })
const setReducedMotion = (on) =>
  send('Emulation.setEmulatedMedia', {
    features: on ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [],
  })

/** 截图 + 可选像素探针（探针元素必须在视口内，否则 FAIL） */
const shot = async (file, probe) => {
  const res = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${OUT}/${file}`, Buffer.from(res.data, 'base64'))
  note(`screenshot → ${file}`)
  if (!probe) return
  let out = null
  try {
    out = await evaluate(
      `(async () => {
        const img = new Image()
        img.src = 'data:image/png;base64,${res.data}'
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const g = c.getContext('2d')
        g.drawImage(img, 0, 0)
        const el = (${probe.elExpr})
        if (!el) return { err: 'probe element not found' }
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        const src = ${probe.colorFrom === 'backgroundColor' ? 'cs.backgroundColor' : 'cs.color'}
        const m = (${JSON.stringify(probe.fixedRgb || null)}) || ((src.match(/\\d+/g) || []).slice(0, 3).map(Number))
        if (m.length < 3) return { err: 'no rgb color: ' + src }
        const sx = img.width / window.innerWidth
        const sy = img.height / window.innerHeight
        const x = Math.max(0, Math.round(r.x * sx))
        const y = Math.max(0, Math.round(r.y * sy))
        const w = Math.max(0, Math.min(img.width - x, Math.round(r.width * sx)))
        const h = Math.max(0, Math.min(img.height - y, Math.round(r.height * sy)))
        if (!w || !h) return { err: 'empty rect', r: { x: r.x, y: r.y, w: r.width, h: r.height } }
        const data = g.getImageData(x, y, w, h).data
        let count = 0
        for (let i = 0; i < data.length; i += 4) {
          const dr = data[i] - m[0]
          const dg = data[i + 1] - m[1]
          const db = data[i + 2] - m[2]
          if (dr * dr + dg * dg + db * db < 2025) count += 1
        }
        const inView =
          r.x >= -1 && r.y >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1
        return { count, px: w * h, ratio: +(count / (w * h)).toFixed(3), rgb: m, inView }
      })()`,
      true,
    )
  } catch (e) {
    out = { err: e.message }
  }
  check(
    `shot ${file}: pixel probe shows expected content`,
    Boolean(out) && !out.err && out.inView === true && out.count >= probe.minCount,
    JSON.stringify(out),
  )
}
const LAST_ME_BUBBLE = {
  elExpr: `[...document.querySelectorAll('.ask-bubble-me')].pop()`,
  colorFrom: 'backgroundColor',
  fixedRgb: [255, 143, 177], // .ask-bubble-me 为线性渐变 #ff8fb1→#ffb6cd，backgroundColor 恒透明 → 用渐变起点色探针
  minCount: 800,
}
const ASK_H1 = {
  elExpr: `[...document.querySelectorAll('h1')].find(e => e.textContent.trim() === '樱见')`,
  colorFrom: 'color',
  minCount: 30,
}
const BACK_WS_PILL = {
  elExpr: `document.querySelector('button[aria-label="返回工作台"]')`,
  colorFrom: 'color',
  minCount: 8,
}
const PINK_PILL = {
  elExpr: `[...document.querySelectorAll('.bg-food-primary')].find(e => e.textContent.includes('全部'))`,
  colorFrom: 'backgroundColor',
  minCount: 1500,
}

/* ================= 页面表达式助手 ================= */
const FV_EXPR = `(document.cookie.match(/(?:^|;\\s*)fv_id=([^;]+)/)||[])[1]||null`
const HEARTS = `[...document.querySelectorAll('button[aria-pressed]')].filter(b => /^(?:收藏|取消收藏)\\s/.test(b.getAttribute('aria-label')||''))`
const heartsReady = `${HEARTS}.length`
const labelAt = (i) => `(() => { const b = ${HEARTS}[${i}]; return b ? b.getAttribute('aria-label') : null })()`
const pressedAt = (i) => `(() => { const b = ${HEARTS}[${i}]; return b ? b.getAttribute('aria-pressed') : null })()`
const clickHeart = (i) =>
  `(() => { const b = ${HEARTS}[${i}]; if (!b) return false; b.click(); return true })()`
const nameOfLabel = (label) => String(label || '').replace(/^(?:取消收藏|收藏)\s*/, '').trim()
const localFavs = `JSON.parse(window.localStorage.getItem('food-nav:favorites')||'[]')`
const serverListExpr = `fetch('/api/favorites',{headers:{Accept:'application/json'}}).then(r=>r.json()).then(p=>(p&&p.data)||[])`
const degradedBanner = `(document.body.textContent||'').includes('数据加载失败，显示本地快照')`

const apiJson = async (path) =>
  evaluate(
    `fetch(${JSON.stringify(path)},{headers:{Accept:'application/json'}})
      .then(async r => ({ status: r.status, payload: await r.json().catch(() => null) }))
      .catch(() => ({ status: 0, payload: null }))`,
    true,
  )
const siteByName = async (name) => {
  const { payload } = await apiJson('/api/sites?status=all&sort=heat')
  return (payload?.data || []).find((s) => s.name === name) || null
}

const H1_SAKURA = `[...document.querySelectorAll('h1')].find(e => e.textContent.trim() === '樱见')`
const TEXTAREA = `document.querySelector('textarea')`
const SEND_BTN = `[...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === '发送')`
const BACK_HOME = `button[aria-label="回到主站"]`
const CLEAR_BTN = `button[aria-label="清空对话"]`
const BACK_WS = `button[aria-label="返回工作台"]`
const CARD_MAIN = `button[aria-label^="关于"][aria-label$="继续追问"]`
const CARD_OPEN = `a[aria-label^="打开"][aria-label$="站点"]`
const DELETE_BTN = `button[aria-label="删除会话"]`
const RESUME_BTN = `[...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('继续对话'))`
const EMPTY_TIP = `[...document.querySelectorAll('p')].some(p => (p.textContent||'').includes('聊聊今天想吃什么吧'))`
const USER_BUBBLES = `document.querySelectorAll('.ask-bubble-me')`
const SESSIONS = `(JSON.parse(localStorage.getItem('food-nav:ask-history') || '{"sessions":[]}').sessions || [])`

const typeInto = async (text) =>
  evaluate(
    `(() => {
      const t = ${TEXTAREA}
      if (!t) return false
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(t, ${JSON.stringify(text)})
      t.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`,
  )
const clickExpr = (expr) =>
  evaluate(`(() => { const el = ${expr}; if (!el) return false; el.click(); return true })()`)
const clickSelector = (sel) => clickExpr(`document.querySelector('${sel}')`)

const toWorkspace = async () => {
  const onWs = await evaluate(`(${USER_BUBBLES}).length === 0 && Boolean(${TEXTAREA})`)
  if (onWs) return true
  const clicked = await clickSelector(BACK_WS)
  if (!clicked) return false
  return poll(`(${USER_BUBBLES}).length === 0 && Boolean(${TEXTAREA})`, 8000)
}

/** 提问 → 等待最后一条 AI 气泡结束流式 */
const sendAndFinish = async (text, label, timeoutMs = 120000) => {
  await typeInto(text)
  await sleep(120)
  const clicked = await clickExpr(SEND_BTN)
  check(`${label}: 发送按钮点击`, clicked === true)
  const done = await waitFor(
    () =>
      evaluate(`(() => {
        const bubbles = [...document.querySelectorAll('.ask-bubble-ai')]
        if (!bubbles.length) return null
        const last = bubbles[bubbles.length - 1]
        const streaming = Boolean(last.querySelector('.animate-pulse'))
        const text = (last.textContent || '').trim()
        return (!streaming && text.length > 5) ? { head: text.slice(0, 70), err: /出错了|太频繁|开小差|异常|超时/.test(text) } : null
      })()`),
    timeoutMs,
  )
  check(`${label}: AI 流式回答完成`, Boolean(done) && !done.err, 'timeout' + (done && done.err ? ` / ${done.head}` : ''))
  if (done) note(`${label} 回答开头: ${done.head}`)
  return Boolean(done)
}

async function ensureAllCards(expectCount) {
  await evaluate(`(() => {
    document.documentElement.style.scrollBehavior = 'auto'
    document.body.style.scrollBehavior = 'auto'
    return true
  })()`)
  for (let i = 0; i < 80; i += 1) {
    const count = await evaluate(`document.querySelectorAll('.food-card a[href^="http"]').length`)
    if (count >= expectCount) break
    await evaluate(`window.scrollBy(0, Math.max(300, Math.round(window.innerHeight * 0.8)))`)
    await sleep(250)
  }
  await evaluate(`window.scrollTo(0, document.body.scrollHeight)`)
  await sleep(500)
  const got = await poll(
    `document.querySelectorAll('.food-card a[href^="http"]').length >= ${expectCount}`,
    10000,
  )
  await evaluate(`window.scrollTo(0, 0)`)
  await sleep(400)
  return got ? expectCount : (await evaluate(`document.querySelectorAll('.food-card a[href^="http"]').length`))
}

async function ensureAdmin() {
  await poll(
    `(() => {
      if (document.querySelector('input[type="password"]')) return 'login';
      if ((document.body.textContent||'').includes('食光管理台')) return 'shell';
      return null;
    })()`,
    20000,
  )
  const needLogin = await evaluate(`!!document.querySelector('input[type="password"]')`)
  if (needLogin) {
    await evaluate(`(() => {
      const i = document.querySelector('input[type="password"]');
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      s.call(i, ${JSON.stringify(ADMIN_PASS)});
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return true })()`)
    await evaluate(`(() => { const f = document.querySelector('form'); if (f) f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return true })()`)
    const logged = await waitFor(async () => evaluate(`(document.body.textContent||'').includes('登出')`), 12000)
    if (!logged) note('admin login did not confirm (登出 not found)')
    else note('admin logged in (live)')
    await sleep(600)
  } else {
    note('admin token still valid (no login)')
  }
}
const clickTab = (label) =>
  evaluate(`(() => {
    const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === ${JSON.stringify(label)});
    if (!b) return false; b.click(); return true })()`)

/* ================= 收尾还原（任意异常都执行，硬约束：线上数据不污染） ================= */
let restoreDone = false
async function restoreAll(context) {
  if (restoreDone) return []
  restoreDone = true
  const out = []
  try {
    await setViewport(1280, 860, false)
  } catch {
    /* ignore */
  }
  try {
    await navigate(`${BASE}/`)
    await waitFor(async () => (await evaluate(heartsReady)) > 0, 20000)
    for (let i = 0; i < 5; i += 1) {
      const idx = await evaluate(
        `(() => { const bs = ${HEARTS}; return bs.findIndex(b => b.getAttribute('aria-pressed') === 'true') })()`,
      )
      if (!idx || idx < 0) break
      await evaluate(clickHeart(idx))
      await sleep(1200)
    }
    const list = await evaluate(serverListExpr, true)
    out.push(`favorites cleaned, left=${JSON.stringify(list)}`)
  } catch (e) {
    out.push(`favorite restore failed: ${e.message}`)
  }
  try {
    await evaluate(`(() => {
      document.documentElement.classList.remove('dark')
      try { localStorage.setItem('food-nav:theme', 'light') } catch (e) {}
      localStorage.removeItem('food-nav:ask-history')
      localStorage.removeItem('food-nav:admin-token')
      localStorage.removeItem('food-nav:favorites')
      localStorage.removeItem('food-nav:music')
      localStorage.removeItem('food-nav:volume')
      return true
    })()`)
    out.push('theme=light + ask-history/admin-token/favorites/music cleared')
  } catch (e) {
    out.push(`storage clean failed: ${e.message}`)
  }
  if (context) note(`restore: ${out.join(' | ')}`)
  return out
}
process.on('uncaughtException', (e) => {
  console.error('EXCEPTION:', e)
  restoreAll(true)
    .then(() => writeLog('[emergency]'))
    .finally(() => process.exit(1))
})
process.on('unhandledRejection', (e) => {
  console.error('REJECTION:', e)
  restoreAll(true)
    .then(() => writeLog('[emergency]'))
    .finally(() => process.exit(1))
})

/* ================= 启动 ================= */
await mkdir(OUT, { recursive: true })
await send('Page.enable')
await send('Network.enable')
await send('Runtime.enable')
await send('Page.bringToFront').catch(() => {})
const visibleOk = await waitFor(async () => {
  const state = await evaluate(`document.visibilityState`).catch(() => null)
  if (state !== 'visible') return false
  const tick = await evaluate(`new Promise(r => setTimeout(() => r(1), 150))`, true).catch(() => null)
  return tick === 1
}, 8000)
if (!visibleOk) {
  console.error('FATAL: 浏览器页面 hidden（窗口被遮挡/最小化）—— 请让 Edge 窗口回到前台后重跑')
  process.exit(2)
}
note('page visible + timers not throttled')

/* ================= [0] 线上探针（4 项） ================= */
console.log('\n[0] live probes (4)')
{
  const home = await fetch(`${BASE}/`, { headers: { Accept: 'text/html' }, redirect: 'manual' }).catch(() => null)
  check('probe 1 GET / -> 200', Boolean(home) && home.status === 200, String(home?.status))

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null)
  check(
    'probe 2 /api/health -> ok:true db:up',
    Boolean(health) && health.ok === true && health.data?.db === 'up',
    JSON.stringify(health),
  )

  const ask = await fetch(`${BASE}/ask`, { headers: { Accept: 'text/html' }, redirect: 'manual' }).catch(() => null)
  check('probe 3 GET /ask -> 200 (SPA fallback)', Boolean(ask) && ask.status === 200, String(ask?.status))

  const sites = await fetch(`${BASE}/api/sites?status=active`).then((r) => r.json()).catch(() => null)
  check(
    'probe 4 GET /api/sites?status=active -> 200 envelope',
    Boolean(sites) && sites.ok === true && Array.isArray(sites.data) && sites.data.length > 0,
    `n=${sites?.data?.length}`,
  )
}

/* ================= [1] 主站回归：渲染 / 懒加载 / 搜索 / 音乐播放器 ================= */
console.log('\n[1] home regression: cards / lazy load / search / music player')
await setViewport(1280, 860, false)
await navigate(`${BASE}/`)
await evaluate(`(() => { localStorage.clear(); return true })()`)
await navigate(`${BASE}/`)
const heartsOk = await poll(heartsReady, 25000)
check('主站卡片渲染（收藏心按钮就绪）', (heartsOk || 0) > 0, `hearts=${heartsOk}`)

const activeSites = (await apiJson('/api/sites?status=active&sort=manual')).payload?.data || []
const apiCount = activeSites.length
note(`active sites (API) = ${apiCount}`)
check('API active 数量 > 0', apiCount > 0, String(apiCount))

const banner = await evaluate(degradedBanner)
check('线上首页无降级提示条', banner !== true, String(banner))

const rendered = await ensureAllCards(apiCount)
check('懒加载渲染卡片数 == API active 数', rendered === apiCount, `rendered=${rendered} api=${apiCount}`)

const navCache = await evaluate(
  `(() => { const raw = localStorage.getItem('food-nav:nav-cache'); if (!raw) return null; try { const p = JSON.parse(raw); return { groups: Array.isArray(p.groups) ? p.groups.length : 0, fresh: Date.now() - p.savedAt < 1800000 }; } catch { return null } })()`,
)
check('nav-cache 写入且新鲜（M6）', Boolean(navCache) && navCache.groups > 0 && navCache.fresh === true, JSON.stringify(navCache))
await shot('06-home-regression.png', PINK_PILL)

// 搜索过滤
{
  const allCards = await evaluate(`document.querySelectorAll('.food-card').length`)
  await evaluate(`(() => {
    const el = document.querySelector('input[type="search"]')
    if (!el) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, '烘焙')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await sleep(700)
  const filtered = await evaluate(`document.querySelectorAll('.food-card').length`)
  const pill = await evaluate(`(document.body.textContent.match(/找到\\s*\\d+\\s*个美味结果/)||[])[0] || ''`)
  check('搜索「烘焙」过滤生效（结果收窄 + 计数文案）', Boolean(pill) && filtered > 0 && filtered < allCards, JSON.stringify({ pill, filtered, allCards }))

  const cleared = await evaluate(`(() => { const b = document.querySelector('button[aria-label="清空搜索"]'); if (b) b.click(); return !!b })()`)
  await sleep(700)
  const restored = await evaluate(`document.querySelectorAll('.food-card').length`)
  check('清空搜索恢复全部卡片', cleared === true && restored === allCards, `restored=${restored} all=${allCards}`)
}

// 音乐播放器展开/收起
{
  const opened = await evaluate(`(() => { const b = document.querySelector('button[aria-label^="展开音乐播放器"]'); if (b) b.click(); return !!b })()`)
  await sleep(900)
  const panel = await evaluate(`(() => {
    const p = document.querySelector('[aria-label="音乐播放器面板"]')
    if (!p) return null
    const labels = [...p.querySelectorAll('button[aria-label]')].map(b => b.getAttribute('aria-label'))
    return { labels: labels.slice(0, 8), hasProgress: !!p.querySelector('input[type="range"]') }
  })()`)
  check(
    '音乐播放器可展开（播放/上一首/下一首/进度条）',
    Boolean(opened) && Boolean(panel) && panel.hasProgress && ['播放', '上一', '下一'].every((l) => panel.labels.some((x) => x && x.includes(l))),
    JSON.stringify(panel),
  )
  const closed = await evaluate(`(() => { const b = document.querySelector('button[aria-label^="收起音乐播放器"]'); if (b) { b.click(); return true } return false })()`)
  await sleep(600)
  const gone = await evaluate(`!document.querySelector('[aria-label="音乐播放器面板"]')`)
  check('音乐播放器可收起', closed === true && gone === true, JSON.stringify({ closed, gone }))
  await evaluate(`(() => { localStorage.removeItem('food-nav:music'); localStorage.removeItem('food-nav:volume'); return true })()`)
}

/* ================= [2] 收藏回归（测完取消还原，不污染热度） ================= */
console.log('\n[2] favorites: PUT on -> heat +5 -> refresh kept -> DELETE off -> restored')
const label0 = await poll(labelAt(0), 8000)
const CARD0 = nameOfLabel(label0)
note(`favorite target = ${CARD0}`)
const base0 = await siteByName(CARD0)
check('基线站点热度捕获', Boolean(base0), JSON.stringify(base0))

const markPut = netlog.length
await evaluate(clickHeart(0))
const put1 = await waitFor(async () => favSince(markPut).find((r) => r.method === 'PUT' && r.status) || null, 10000)
check('收藏点击发送 PUT /api/favorites/{id}（线上）', Boolean(put1), 'no PUT in netlog')
if (put1) check('PUT -> 200', put1.status === 200, String(put1.status))
check('aria-pressed 变 true', (await poll(`${pressedAt(0)} === 'true'`, 8000)) === true)
check(
  '收藏写入 localStorage',
  (await evaluate(`(${localFavs}).includes(${JSON.stringify(CARD0)})`)) === true,
  await evaluate(localFavs),
)
const heatUp = await waitFor(async () => {
  const s = await siteByName(CARD0)
  return s && base0 && s.favoriteCount === base0.favoriteCount + 1 && s.heatScore === base0.heatScore + 5 ? s : null
}, 12000)
check('收藏 +1 -> favorite_count+1 & heat_score+5', Boolean(heatUp), JSON.stringify({ before: base0, after: heatUp }))

await navigate(`${BASE}/`)
await poll(heartsReady, 25000)
await poll(`${pressedAt(0)} === 'true'`, 8000)
check('刷新后收藏保留（本地 + 服务端）', (await evaluate(pressedAt(0))) === 'true')

const markDel = netlog.length
await evaluate(clickHeart(0))
const del1 = await waitFor(async () => favSince(markDel).find((r) => r.method === 'DELETE' && r.status) || null, 10000)
check('取消收藏发送 DELETE', Boolean(del1), 'no DELETE in netlog')
const listAfter = await evaluate(serverListExpr, true)
check('取消后服务端收藏列表为空', Array.isArray(listAfter) && listAfter.length === 0, JSON.stringify(listAfter))
const heatBack = await waitFor(async () => {
  const s = await siteByName(CARD0)
  return s && base0 && s.favoriteCount === base0.favoriteCount && s.heatScore === base0.heatScore ? s : null
}, 12000)
check('取消后热度还原基线（不污染线上数据）', Boolean(heatBack), JSON.stringify({ base0 }))

/* ================= [3] M10-① AI 推荐闭环 ================= */
console.log('\n[3] M10-① recommend card -> 主体追问 + 角落外链（线上 AI）')
await goHash('#/ask')
const wsReady = await poll(`Boolean(${H1_SAKURA}) && Boolean(${TEXTAREA})`, 15000)
check('/ask 工作台渲染（樱见 + composer）', wsReady === true)

await sendAndFinish('推荐几个烘焙网站', '推荐提问')

let cards = await waitFor(() => evaluate(`document.querySelectorAll('${CARD_MAIN}').length`), 60000)
if (!cards) {
  note('首轮未出推荐卡，换问法重试')
  await sendAndFinish('有哪些好用的烘焙网站推荐？', '推荐提问-重试')
  cards = await waitFor(() => evaluate(`document.querySelectorAll('${CARD_MAIN}').length`), 60000)
}
check('推荐卡片渲染（主体 = 追问按钮）', (cards || 0) >= 1, `count=${cards}`)

const openInfo = await evaluate(`(() => {
  const a = document.querySelector('${CARD_OPEN}')
  if (!a) return null
  const r = a.getBoundingClientRect()
  return { target: a.getAttribute('target'), rel: a.getAttribute('rel'), w: Math.round(r.width), h: Math.round(r.height), aria: a.getAttribute('aria-label') }
})()`)
check('角落按钮 target=_blank + rel=noopener', Boolean(openInfo) && openInfo.target === '_blank' && /noopener/.test(openInfo.rel || ''), JSON.stringify(openInfo))
check('角落按钮触控 ≥40×40', Boolean(openInfo) && openInfo.w >= 40 && openInfo.h >= 40, JSON.stringify(openInfo))
check('角落按钮 aria-label=打开…站点', Boolean(openInfo) && /^打开.+站点$/.test(openInfo.aria || ''), JSON.stringify(openInfo?.aria))

const cardMainInfo = await evaluate(`(() => {
  const b = document.querySelector('${CARD_MAIN}')
  if (!b) return null
  return { tag: b.tagName, aria: b.getAttribute('aria-label') }
})()`)
check('卡片主体是 <button>（不再整卡外链）', Boolean(cardMainInfo) && cardMainInfo.tag === 'BUTTON', JSON.stringify(cardMainInfo))
check('卡片主体 aria-label=关于…继续追问', Boolean(cardMainInfo) && /^关于.+继续追问$/.test(cardMainInfo.aria || ''), JSON.stringify(cardMainInfo?.aria))

const beforeClick = await evaluate(`(${USER_BUBBLES}).length`)
const clickedCard = await clickExpr(`document.querySelector('${CARD_MAIN}')`)
check('点击卡片主体', clickedCard === true)
const followMsg = await waitFor(
  () =>
    evaluate(`(() => {
      const u = [...document.querySelectorAll('.ask-bubble-me')]
      return u.some(x => (x.textContent||'').includes('这个站点「') && (x.textContent||'').includes('看起来不错'))
        ? u.length : null
    })()`),
  30000,
)
check('对话流追加带站点上下文的追问消息', Boolean(followMsg), 'timeout waiting follow-up')
check('追问问句与手输消息同构（用户气泡 +1）', Boolean(followMsg) && followMsg === beforeClick + 1, `${beforeClick} → ${followMsg}`)
await sleep(1500)
await shot('01-ask-recommend-ask.png', LAST_ME_BUBBLE)

const followDone = await waitFor(
  () =>
    evaluate(`(() => {
      const bubbles = [...document.querySelectorAll('.ask-bubble-ai')]
      if (bubbles.length < 2) return null
      const last = bubbles[bubbles.length - 1]
      const streaming = Boolean(last.querySelector('.animate-pulse'))
      const text = (last.textContent || '').trim()
      return (!streaming && text.length > 5) ? { head: text.slice(0, 70), err: /出错了|太频繁|开小差|异常|超时/.test(text) } : null
    })()`),
  120000,
)
check('AI 流式回答该追问（复用发送链路）', Boolean(followDone) && !followDone.err, 'timeout' + (followDone && followDone.err ? ` / ${followDone.head}` : ''))
if (followDone) note(`追问回答开头: ${followDone.head}`)

/* ================= [4] M10-② 返回工作台（保留会话） ================= */
console.log('\n[4] M10-② 返回工作台 -> 会话入面板 -> 继续对话恢复')
const backBtn = await waitFor(() => evaluate(`Boolean(document.querySelector('${BACK_WS}'))`), 10000)
check('对话态 header 出现「返回工作台」', backBtn === true)
const backDisabled = await evaluate(`(() => { const b = document.querySelector('${BACK_WS}'); return b ? b.disabled : null })()`)
check('生成结束后返回按钮可用', backDisabled === false, String(backDisabled))
check('返回工作台点击', (await clickSelector(BACK_WS)) === true)
check('回到工作台（对话流退出）', (await poll(`(${USER_BUBBLES}).length === 0 && Boolean(${H1_SAKURA})`, 8000)) === true)

const sessionAfterBack = await evaluate(`${SESSIONS}`)
check('会话进「最近会话」（storage sessions ≥1）', Array.isArray(sessionAfterBack) && sessionAfterBack.length >= 1, JSON.stringify(sessionAfterBack?.length))
const hasFollow = await evaluate(`(${SESSIONS}).some(s => (s.messages || []).some(m => (m.content || '').includes('这个站点「')))`)
check('会话内容含站点追问消息', hasFollow === true)
const rows1 = await waitFor(() => evaluate(`document.querySelectorAll('${DELETE_BTN}').length`), 8000)
check('面板出现该会话行（含删除按钮）', rows1 >= 1, `rows=${rows1}`)
await shot('02-ask-back-workspace.png', ASK_H1)

check('点击「继续对话」恢复', (await clickExpr(RESUME_BTN)) === true)
check(
  '恢复的对话含追问问句（记忆链路）',
  (await poll(`[...document.querySelectorAll('.ask-bubble-me')].some(x => (x.textContent||'').includes('这个站点「'))`, 8000)) === true,
)

/* ================= [5] M10-③ 会话单条删除 ================= */
console.log('\n[5] M10-③ 单条删除 / 删空空态（线上 storage 同步）')
check('返回工作台（分离当前会话）', (await toWorkspace()) === true)
await sendAndFinish('舒芙蕾为什么会塌？', '第二会话')
check('第二会话后返回工作台', (await toWorkspace()) === true)

const rows2 = await evaluate(`document.querySelectorAll('${DELETE_BTN}').length`)
const sess2 = await evaluate(`${SESSIONS}.length`)
check('两条会话并存（面板 2 行 / storage 2 条）', rows2 === 2 && sess2 === 2, `rows=${rows2} sessions=${sess2}`)

const delInfo = await evaluate(`(() => {
  const btns = [...document.querySelectorAll('${DELETE_BTN}')]
  if (!btns.length) return null
  const t = btns[btns.length - 1]
  const r = t.getBoundingClientRect()
  t.click()
  return { w: Math.round(r.width), h: Math.round(r.height) }
})()`)
check('删除按钮触控目标 ≥40×40', Boolean(delInfo) && delInfo.w >= 40 && delInfo.h >= 40, JSON.stringify(delInfo))
await sleep(500)
const rowsAfter = await evaluate(`document.querySelectorAll('${DELETE_BTN}').length`)
const sessAfter = await evaluate(`${SESSIONS}.length`)
check('删一条 -> 面板与 storage 同步（2→1）', rowsAfter === 1 && sessAfter === 1, `rows=${rowsAfter} sessions=${sessAfter}`)

await clickExpr(`[...document.querySelectorAll('${DELETE_BTN}')][0]`)
await sleep(500)
check('删空 -> 面板空态引导', (await evaluate(`${EMPTY_TIP}`)) === true)
check('删空 -> storage 键移除', (await evaluate(`localStorage.getItem('food-nav:ask-history') === null`)) === true)

/* 注入 1 条本地会话（仅 localStorage，供 375/暗色面板行检查；收尾清理） */
await evaluate(`(() => {
  const now = Date.now()
  localStorage.setItem('food-nav:ask-history', JSON.stringify({
    savedAt: now,
    sessions: [{ id: now, savedAt: now, messages: [{ id: 1, role: 'user', content: '线上回归测试会话', status: 'done', sites: [] }] }],
  }))
  return localStorage.getItem('food-nav:ask-history') ? 1 : 0
})()`)
await reload()
check('注入会话后恢复（bootstrap 进对话态）', (await poll(`(${USER_BUBBLES}).length > 0`, 8000)) === true)
check('返回工作台可见 1 行', (await toWorkspace()) === true)
check('面板 1 行（删除按钮就绪）', (await waitFor(() => evaluate(`document.querySelectorAll('${DELETE_BTN}').length`), 6000)) === 1)

/* ================= [6] M10-④ 路由切换淡入 ================= */
console.log('\n[6] M10-④ route-fade 180ms + reduced-motion')
await goHash('#/')
const routeAnim = await evaluate(`(() => {
  const el = document.querySelector('.route-fade')
  if (!el) return null
  const cs = getComputedStyle(el)
  return { name: cs.animationName, duration: cs.animationDuration, pe: cs.pointerEvents }
})()`)
check('主站路由外壳带 route-fade 动画', Boolean(routeAnim) && routeAnim.name === 'route-fade-in', JSON.stringify(routeAnim))
check('动画时长 0.18s', Boolean(routeAnim) && routeAnim.duration === '0.18s', JSON.stringify(routeAnim))
check('过渡不遮挡交互（pointer-events=auto）', Boolean(routeAnim) && routeAnim.pe === 'auto', JSON.stringify(routeAnim))

await goHash('#/ask')
const routeAnim2 = await evaluate(`(() => {
  const el = document.querySelector('.route-fade')
  return el ? { name: getComputedStyle(el).animationName, duration: getComputedStyle(el).animationDuration } : null
})()`)
check('/ask 路由同样带 route-fade 0.18s', Boolean(routeAnim2) && routeAnim2.name === 'route-fade-in' && routeAnim2.duration === '0.18s', JSON.stringify(routeAnim2))

await setReducedMotion(true)
const rmAnim = await evaluate(`(() => { const el = document.querySelector('.route-fade'); return el ? getComputedStyle(el).animationName : null })()`)
check('reduced-motion：路由动画关闭', rmAnim === 'none', String(rmAnim))
await setReducedMotion(false)

/* ================= [7] M10-⑤ 全局点击樱花散花 ================= */
console.log('\n[7] M10-⑤ 樱花散花（3-5 片 / 限频 / 1s 清除 / reduced-motion / 不拦截）')
const waitPetalsClear = () => waitFor(() => evaluate(`document.querySelectorAll('.sakura-petal').length === 0`), 4000)

await waitPetalsClear()
await setReducedMotion(true)
await evaluate(`(() => { document.body.click(); return document.querySelectorAll('.sakura-petal').length })()`)
await sleep(250)
const petalRM = await evaluate(`document.querySelectorAll('.sakura-petal').length`)
check('reduced-motion：不生成花瓣', petalRM === 0, `count=${petalRM}`)
await setReducedMotion(false)

await waitPetalsClear()
await evaluate(`(() => { document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 420, clientY: 300 })); return true })()`)
await sleep(150)
const petal1 = await evaluate(`(() => {
  const ps = [...document.querySelectorAll('.sakura-petal')]
  const layer = document.querySelector('.sakura-layer')
  return { count: ps.length, pe: layer ? getComputedStyle(layer).pointerEvents : null, aria: layer ? layer.getAttribute('aria-hidden') : null }
})()`)
check('单击生成 3-5 片花瓣', petal1.count >= 3 && petal1.count <= 5, JSON.stringify(petal1))
check('花瓣层 pointer-events:none + aria-hidden', petal1.pe === 'none' && petal1.aria === 'true', JSON.stringify(petal1))
await shot('04-sakura-burst.png')

const burst2 = await evaluate(`(() => {
  const fire = (x, y) => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }))
  fire(640, 420)
  const after1 = document.querySelectorAll('.sakura-petal').length
  fire(700, 460)
  const after2 = document.querySelectorAll('.sakura-petal').length
  return { after1, after2 }
})()`)
check('300ms 限频：同刻连点花瓣数不增加', burst2.after2 === burst2.after1, JSON.stringify(burst2))
const gone = await waitFor(() => evaluate(`document.querySelectorAll('.sakura-petal').length === 0`), 4000)
check('花瓣 ~1s 后消失并移除 DOM', gone === true)

await goHash('#/')
const entryClicked = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').includes('问问樱见'))
  if (!b) return 'no-entry'
  b.click()
  return 'clicked'
})()`)
const jumped = await poll(`location.hash.startsWith('#/ask')`, 6000)
check('散花不拦截默认行为（问问樱见入口跳转正常）', entryClicked === 'clicked' && jumped === true, `${entryClicked}/${jumped}`)

/* ================= [8] 主题（暗色）：新交互 token ================= */
console.log('\n[8] theme dark: 主站切换 + /ask 新交互 token')
await goHash('#/')
await poll(heartsReady, 25000)
const lightBg = await evaluate(`getComputedStyle(document.body).backgroundColor`)
const themeClicked = await evaluate(`(() => { const b = [...document.querySelectorAll('header button')].find(x => (x.getAttribute('aria-label')||'').includes('主题')); if (b) b.click(); return !!b })()`)
await sleep(400)
const darkOn = await evaluate(`document.documentElement.classList.contains('dark')`)
const darkBg = await evaluate(`getComputedStyle(document.body).backgroundColor`)
check('主站暗色切换生效', themeClicked === true && darkOn === true && darkBg !== lightBg, JSON.stringify({ lightBg, darkBg }))

await goHash('#/ask')
await poll(`(${USER_BUBBLES}).length > 0`, 8000)
const darkPanel = await evaluate(`(() => { const p = document.querySelector('.ask-panel'); return p ? getComputedStyle(p).backgroundColor : null })()`)
check('暗色下 ask-panel 生效', Boolean(darkPanel) && darkPanel !== 'rgba(0, 0, 0, 0)', String(darkPanel))
check('暗色下返回工作台可见', (await toWorkspace()) === true)
const darkDel = await evaluate(`(() => { const b = document.querySelector('${DELETE_BTN}'); return b ? getComputedStyle(b).color : null })()`)
check('暗色下删除按钮有可见颜色', Boolean(darkDel) && darkDel !== 'rgba(0, 0, 0, 0)', String(darkDel))
await shot('05-dark.png')
await goHash('#/')
await poll(heartsReady, 8000)
await evaluate(`(() => { const b = [...document.querySelectorAll('header button')].find(x => (x.getAttribute('aria-label')||'').includes('主题')); if (b) b.click(); return true })()`)
await sleep(400)
check('切回亮色', (await evaluate(`!document.documentElement.classList.contains('dark')`)) === true)

/* ================= [9] 375 移动端 ================= */
console.log('\n[9] 375: 主站 / /ask header 无溢出 + 触控目标')
await setViewport(375, 760, true)
await navigate(`${BASE}/`)
await poll(heartsReady, 25000)
const ovHome = await evaluate(`({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth })`)
check('主站 375 无横向溢出', ovHome.doc <= 375 && ovHome.body <= 375, JSON.stringify(ovHome))

await goHash('#/ask')
check('/ask 恢复注入会话（对话态）', (await poll(`(${USER_BUBBLES}).length > 0`, 8000)) === true)
const mobileHeader = await evaluate(`(() => {
  const backHome = document.querySelector('${BACK_HOME}')
  const backWs = document.querySelector('${BACK_WS}')
  const clear = document.querySelector('${CLEAR_BTN}')
  const group = backHome ? backHome.closest('.grid') : null
  const r = group ? group.getBoundingClientRect() : null
  const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) } }
  return {
    inner: window.innerWidth,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    groupLeft: r ? Math.round(r.left) : null,
    groupRight: r ? Math.round(r.right) : null,
    backWs: rect(backWs),
    clear: rect(clear),
  }
})()`)
check('/ask 375 无横向溢出（对话态）', mobileHeader && mobileHeader.overflowX === false, JSON.stringify(mobileHeader))
check('header 按钮组在视口内（返回主站|返回工作台 … |清空）', Boolean(mobileHeader) && mobileHeader.groupLeft >= 0 && mobileHeader.groupRight <= mobileHeader.inner, JSON.stringify(mobileHeader))
check('返回工作台按钮 ≥36×36', Boolean(mobileHeader?.backWs) && mobileHeader.backWs.h >= 36 && mobileHeader.backWs.w >= 36, JSON.stringify(mobileHeader?.backWs))
await shot('03-mobile-375.png', BACK_WS_PILL)

check('375 返回工作台', (await toWorkspace()) === true)
const mobileDel = await evaluate(`(() => {
  const b = document.querySelector('${DELETE_BTN}')
  if (!b) return null
  const r = b.getBoundingClientRect()
  return { w: Math.round(r.width), h: Math.round(r.height) }
})()`)
check('375 最近会话删除按钮 ≥40×40', Boolean(mobileDel) && mobileDel.w >= 40 && mobileDel.h >= 40, JSON.stringify(mobileDel))
check('工作台 375 无横向溢出', (await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`)) === true)
await setViewport(1280, 860, false)

/* ================= [10] admin 冒烟（只读，不写数据） ================= */
console.log('\n[10] admin smoke: login -> 站点表格 -> 热度榜（只读）')
await navigate(`${BASE}/#/admin`)
await ensureAdmin()
const shellOk = await poll(`(document.body.textContent||'').includes('食光管理台') && (document.body.textContent||'').includes('站点总数')`, 20000)
check('admin 登录 + 仪表盘渲染（站点总数）', shellOk === true, String(shellOk))
const heatOk = await waitFor(
  () =>
    evaluate(`(() => {
      const h = [...document.querySelectorAll('h2')].find(x => x.textContent.includes('站点热度榜'))
      if (!h) return null
      const sec = h.closest('section')
      const rows = sec ? sec.querySelectorAll('tbody tr').length : 0
      return rows > 0 ? rows : null
    })()`),
  15000,
)
check('热度榜渲染（Top10 行）', Boolean(heatOk), `rows=${heatOk}`)

const tabSites = await clickTab('站点管理')
const tableOk = await waitFor(
  () =>
    evaluate(`(() => {
      const tables = [...document.querySelectorAll('table')]
      let best = 0
      for (const t of tables) best = Math.max(best, t.querySelectorAll('tbody tr').length)
      const hasTotal = /共\\s*\\d+\\s*个站点/.test(document.body.textContent || '')
      return (best >= 10 && hasTotal) ? best : 0
    })()`),
  20000,
)
check('站点管理表格渲染数据行（只读，行数 ≥10）', tabSites === true && (tableOk || 0) >= 10, `rows=${tableOk}`)
const sitesTotal = await evaluate(`(document.body.textContent.match(/共\\s*(\\d+)\\s*个站点/) || [])[1] || ''`)
note(`admin 站点表：可见行数=${tableOk} · 共 ${sitesTotal} 个站点（未点击任何写操作按钮）`)

/* ================= [11] 收尾还原（线上数据不污染） ================= */
console.log('\n[11] restore: 收藏取消 / 主题 / 本地存储清理')
await restoreAll(false)
{
  const themeLight = await evaluate(`!document.documentElement.classList.contains('dark')`)
  check('主题还原亮色', themeLight === true, String(themeLight))

  const fvNow = await evaluate(FV_EXPR)
  const finalList = await evaluate(serverListExpr, true).catch(() => null)
  check('服务端收藏列表为空（取消还原）', Array.isArray(finalList) && finalList.length === 0, JSON.stringify(finalList))

  const c0 = await siteByName(CARD0)
  check(
    '目标站点热度 == 基线（无污染）',
    Boolean(c0) && Boolean(base0) && c0.favoriteCount === base0.favoriteCount && c0.heatScore === base0.heatScore,
    JSON.stringify({ base0, c0 }),
  )

  await evaluate(`(() => {
    localStorage.removeItem('food-nav:ask-history')
    localStorage.removeItem('food-nav:admin-token')
    localStorage.removeItem('food-nav:favorites')
    return true
  })()`)
  const cleaned = await evaluate(`!localStorage.getItem('food-nav:ask-history') && !localStorage.getItem('food-nav:admin-token') && !localStorage.getItem('food-nav:favorites')`)
  check('本地 ask-history / admin token / favorites 已清理', cleaned === true, String(cleaned))
  note(`final fv_id=${fvNow}`)
}

/* ================= 证据落盘 ================= */
const netlogText = [
  '# task-20 NetLog 证据（CDP Network，线上；收藏 PUT/DELETE + AI SSE）',
  `# 时间 ${new Date().toISOString()}`,
  '',
  ...netlog
    .filter((r) => r.url.includes('/api/favorites') || r.url.includes('/api/ai/chat'))
    .map((r) =>
      [
        `${r.method} ${r.url}`,
        `  status: ${r.status ?? '(pending)'}`,
        `  content-type: ${r.contentType || '-'}`,
        `  X-Fav-Sign: ${r.headers['X-Fav-Sign'] || r.headers['x-fav-sign'] || '-'}`,
      ].join('\n'),
    ),
  '',
  '# 说明：收藏测完已取消还原；AI 为 GLM SSE 流式；测毕 localStorage 已清理。',
].join('\n')
await writeFile(`${OUT}/netlog-live.txt`, netlogText)

await writeLog('[done]')
console.log(`\nRESULT: ${pass} passed / ${fail} failed  →  ${OUT}/acceptance-log.txt`)
try {
  ws.close()
} catch {
  /* ignore */
}
process.exit(fail > 0 ? 1 : 0)

/* ================= 局部工具（供 reload 使用） ================= */
async function reload() {
  await send('Page.reload', { ignoreCache: false })
  await waitFor(async () => (await evaluate(`document.readyState`)) === 'complete', 20000)
  await sleep(500)
}
