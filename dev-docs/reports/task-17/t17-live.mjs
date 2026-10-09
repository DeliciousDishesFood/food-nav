// task-17 · M6-M9 批次部署上线 + 线上全面回归 —— CDP 浏览器回归脚本
// 访问 https://food-nav.shiora.cc（线上，非本地 pages dev）
// 用法：node dev-docs/reports/task-17/t17-live.mjs
// 前置：Edge/Chrome 以 --remote-debugging-port=9222 + 独立 --user-data-dir 启动
// 证据：acceptance-log.txt · netlog-live.txt · 01~06 截图
// 安全：FOAVORITE_SALT / ADMIN_PASSWORD 运行时从 .dev.vars（已 .gitignore）读取，不写入本文件
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const BASE = 'https://food-nav.shiora.cc'
const CDP = 'http://127.0.0.1:9222'
const ROOT = 'E:/react/food-nav'
const OUT = `${ROOT}/dev-docs/reports/task-17`

/** 从 .dev.vars 读密钥（gitignore 文件，运行时读取，不落仓库） */
async function readDevVar(name) {
  try {
    const raw = await readFile(`${ROOT}/.dev.vars`, 'utf8')
    const match = new RegExp(`^${name}=(.*)$`, 'm').exec(raw)
    return match ? match[1].trim() : ''
  } catch {
    return ''
  }
}
const ADMIN_PASS = await readDevVar('ADMIN_PASSWORD')
const SALT = await readDevVar('FAVORITE_SALT')
if (!ADMIN_PASS || !SALT) {
  console.error('FATAL: .dev.vars 缺少 ADMIN_PASSWORD / FAVORITE_SALT')
  process.exit(1)
}

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

/* ================= 网络日志（含响应头，供 SSE 证据） ================= */
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
      cur.origin === want.origin &&
      cur.pathname === want.pathname &&
      state.ready === 'complete'
    )
  }, 25000)
  if (!ok) note(`navigate slow/timeout: ${url}`)
  await sleep(400)
}
const goHash = async (hash) => {
  await evaluate(`(() => { window.location.hash = ${JSON.stringify(hash)}; return true })()`)
  await sleep(600)
}

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
        const m = (src.match(/\\d+/g) || []).slice(0, 3).map(Number)
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
const PINK_PILL = {
  elExpr: `[...document.querySelectorAll('.bg-food-primary')].find(e => e.textContent.includes('全部'))`,
  colorFrom: 'backgroundColor',
  minCount: 1500,
}
const HEAT_TD = {
  elExpr: `[...document.querySelectorAll('td[class*="text-food-primary"]')].find(el => {
    const r = el.getBoundingClientRect()
    return r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
  })`,
  colorFrom: 'color',
  minCount: 20,
}
const ASK_H1 = {
  elExpr: `[...document.querySelectorAll('h1')].find(e => e.textContent.trim() === '樱见')`,
  colorFrom: 'color',
  minCount: 40,
}
const setViewport = (width, height, mobile = false) =>
  send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile,
  })

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
const signExpr = (fv) =>
  `(async (fv) => { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fv + ${JSON.stringify(SALT)})); return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32) })(${JSON.stringify(fv)})`
const serverListExpr = `fetch('/api/favorites',{headers:{Accept:'application/json'}}).then(r=>r.json()).then(p=>(p&&p.data)||[])`
const degradedBanner = `(document.body.textContent||'').includes('数据加载失败，显示本地快照')`

const findHeartIndex = (name) =>
  evaluate(`(() => {
    const want = ${JSON.stringify(name)};
    const bs = ${HEARTS};
    return bs.findIndex(b => {
      const label = b.getAttribute('aria-label') || '';
      return label === ('收藏 ' + want) || label === ('取消收藏 ' + want);
    });
  })()`)

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

/** 逐屏滚动触发懒加载 → 卡片全渲染（关掉 smooth scroll，按卡片数循环推进） */
async function ensureAllCards(expectCount) {
  await evaluate(`(() => {
    document.documentElement.style.scrollBehavior = 'auto'
    document.body.style.scrollBehavior = 'auto'
    return true
  })()`)
  for (let i = 0; i < 80; i += 1) {
    const count = await evaluate(
      `document.querySelectorAll('.food-card a[href^="http"]').length`,
    )
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
  return got
    ? expectCount
    : (await evaluate(`document.querySelectorAll('.food-card a[href^="http"]').length`))
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

const readHeatBoard = () =>
  evaluate(`(() => {
    const h = [...document.querySelectorAll('h2')].find(x => x.textContent.includes('站点热度榜'));
    if (!h) return null;
    const sec = h.closest('section');
    if (!sec) return null;
    return {
      head: [...sec.querySelectorAll('thead th')].map(t => t.textContent.trim()),
      rows: [...sec.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => ({ text: td.textContent.trim(), cls: td.className }))),
      empty: sec.textContent.includes('暂无热度数据'),
    };
  })()`)

/** 取消全部服务端收藏（收尾还原，签名在页内计算） */
async function unfavoriteAll(fvId) {
  if (!fvId) return { list: [], cleaned: false }
  const sign = await evaluate(signExpr(fvId), true)
  const list = await evaluate(serverListExpr, true)
  if (!Array.isArray(list) || list.length === 0) return { list: [], cleaned: true }
  for (const item of list) {
    await evaluate(
      `(async () => {
        const res = await fetch('/api/favorites/${item.siteId ?? item.id}', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json', 'X-Fav-Sign': ${JSON.stringify(sign || '')} },
          body: JSON.stringify({ visitor_id: ${JSON.stringify(fvId)} }),
        });
        return res.status;
      })()`,
      true,
    )
  }
  const after = await evaluate(serverListExpr, true)
  return { list: after, cleaned: Array.isArray(after) && after.length === 0 }
}

/** 任意异常/提前退出都要还原线上数据（硬约束：收藏/计数必须还原） */
let emergencyDone = false
async function emergencyRestore() {
  if (emergencyDone) return
  emergencyDone = true
  try {
    await restoreAll(true)
  } catch (e) {
    console.error('emergency restore failed:', e.message)
  }
}
process.on('uncaughtException', (e) => {
  console.error('EXCEPTION:', e)
  emergencyRestore().finally(() => process.exit(1))
})
process.on('unhandledRejection', (e) => {
  console.error('REJECTION:', e)
  emergencyRestore().finally(() => process.exit(1))
})

/** 收尾还原：解封 /api、清收藏、清会话历史、切回亮色、清 admin token */
async function restoreAll(context) {
  const out = []
  try {
    await send('Network.setBlockedURLs', { urls: [] })
    out.push('unblocked /api')
  } catch (e) {
    out.push(`unblock failed: ${e.message}`)
  }
  try {
    const fv = await evaluate(FV_EXPR)
    if (fv) {
      const r = await unfavoriteAll(fv)
      out.push(`favorites cleaned=${r.cleaned} left=${JSON.stringify(r.list)}`)
    }
  } catch (e) {
    out.push(`favorite cleanup failed: ${e.message}`)
  }
  try {
    await evaluate(`(() => { localStorage.removeItem('food-nav:ask-history'); return true })()`)
    out.push('ask-history cleared')
  } catch {
    /* ignore */
  }
  try {
    const dark = await evaluate(`document.documentElement.classList.contains('dark')`)
    if (dark) {
      await evaluate(`(() => {
        const b = [...document.querySelectorAll('header button')].find(x => (x.getAttribute('aria-label')||'').includes('主题'));
        if (b) b.click(); return true })()`)
      await sleep(300)
      out.push('theme back to light')
    }
  } catch (e) {
    out.push(`theme restore failed: ${e.message}`)
  }
  try {
    await evaluate(`(() => { localStorage.removeItem('food-nav:admin-token'); return true })()`)
    out.push('admin token cleared')
  } catch {
    /* ignore */
  }
  if (context) note(`restore: ${out.join(' | ')}`)
  return out
}

/* ================= 启动 ================= */
mkdir(OUT, { recursive: true }).catch(() => {})
await send('Page.enable')
await send('Network.enable')
await send('Runtime.enable')

/* 页面可见性护栏：hidden 页面会被 Chromium 节流（IntersectionObserver / setTimeout / 页面侧 fetch 挂起） */
await send('Page.bringToFront').catch(() => {})
const visibleOk = await waitFor(async () => {
  const state = await evaluate(`document.visibilityState`).catch(() => null)
  if (state !== 'visible') return false
  const tick = await evaluate(`new Promise(r => setTimeout(() => r(1), 150))`, true).catch(() => null)
  return tick === 1
}, 8000)
if (!visibleOk) {
  console.error(
    'FATAL: 浏览器页面 hidden（窗口被遮挡/最小化），IO 与定时器被节流 —— 请让测试窗口回到前台后重跑',
  )
  process.exit(1)
}
note('page visible + timers not throttled (IO 可用)')

/* ================= P0 线上探针（6 项） ================= */
console.log('\n[P0] live probes (6)')
{
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null)
  check(
    'probe 1 /api/health -> ok:true db:up',
    Boolean(health) && health.ok === true && health.data?.db === 'up',
    JSON.stringify(health),
  )

  const home = await fetch(`${BASE}/`, {
    headers: { Accept: 'text/html' },
    redirect: 'manual',
  }).catch(() => null)
  const setCookie = home ? home.headers.get('set-cookie') || '' : ''
  check(
    'probe 2 GET / -> 200 + Set-Cookie fv_id',
    Boolean(home) && home.status === 200 && /fv_id=/.test(setCookie),
    `${home?.status} ${setCookie.slice(0, 60)}`,
  )

  const fav = await fetch(`${BASE}/api/favorites`).catch(() => null)
  const favBody = fav ? await fav.json().catch(() => null) : null
  check(
    'probe 3 GET /api/favorites -> 401 no_visitor',
    Boolean(fav) && fav.status === 401 && favBody?.error?.code === 'no_visitor',
    JSON.stringify({ status: fav?.status, body: favBody }),
  )

  const stats = await fetch(`${BASE}/api/stats/visits?days=1`).catch(() => null)
  check('probe 4 GET /api/stats/visits -> 401 (auth required)', Boolean(stats) && stats.status === 401, String(stats?.status))

  let aiOk = false
  let aiDetail = ''
  try {
    const ctrl = new AbortController()
    const ai = await fetch(`${BASE}/api/ai/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
      signal: ctrl.signal,
    })
    const ctype = ai.headers.get('content-type') || ''
    const reader = ai.body.getReader()
    const first = await reader.read()
    await reader.cancel().catch(() => {})
    ctrl.abort()
    const text = new TextDecoder().decode(first.value || new Uint8Array())
    aiOk = ai.status === 200 && ctype.includes('text/event-stream') && text.includes('data:')
    aiDetail = `status=${ai.status} ct=${ctype} first=${text.slice(0, 80).replace(/\s+/g, ' ')}`
  } catch (e) {
    aiDetail = e.message
  }
  check('probe 5 POST /api/ai/chat -> 200 SSE (glm-4-flash)', aiOk, aiDetail)

  const sites = await fetch(`${BASE}/api/sites?status=active`).then((r) => r.json()).catch(() => null)
  check(
    'probe 6 GET /api/sites?status=active -> 200 envelope',
    Boolean(sites) && sites.ok === true && Array.isArray(sites.data) && sites.data.length > 0,
    `n=${sites?.data?.length}`,
  )
}

/* ================= P1 首页（200 / fv_id / API 数据 / 无降级条） ================= */
console.log('\n[P1] live home: cookie + API data + no degraded banner')
await setViewport(1280, 860, false)
await send('Network.clearBrowserCookies')
await navigate(`${BASE}/`)
await evaluate(`(() => { localStorage.clear(); return true })()`)
await navigate(`${BASE}/`)
await poll(heartsReady, 25000)

const fvId = await poll(FV_EXPR, 8000)
check('fresh fv_id cookie issued by middleware (live)', Boolean(fvId), String(fvId))
note(`fv_id=${fvId}`)

const activeSites = (await apiJson('/api/sites?status=active&sort=manual')).payload?.data || []
const apiCardCount = activeSites.length
note(`active sites (API) = ${apiCardCount}`)

const bannerNow = await evaluate(degradedBanner)
check('no degraded banner on live home', bannerNow !== true, String(bannerNow))

const rendered = await ensureAllCards(apiCardCount)
check(
  'cards rendered == active API count (lazy load ok)',
  rendered === apiCardCount,
  `rendered=${rendered} api=${apiCardCount}`,
)

const navCache = await evaluate(
  `(() => { const raw = localStorage.getItem('food-nav:nav-cache'); if (!raw) return null; try { const p = JSON.parse(raw); return { savedAt: p.savedAt, groups: Array.isArray(p.groups) ? p.groups.length : 0, fresh: Date.now() - p.savedAt < 1800000 }; } catch { return null } })()`,
)
check(
  'API data marker: nav-cache written & fresh (M6)',
  Boolean(navCache) && navCache.groups > 0 && navCache.fresh === true,
  JSON.stringify(navCache),
)

const label0 = await poll(labelAt(0), 8000)
const CARD0 = nameOfLabel(label0)
note(`card0 = ${CARD0}`)
await shot('01-live-home.png', PINK_PILL)

/* ================= P2 收藏服务端化（线上 PUT/DELETE + 签名 + 刷新保留 + 热度） ================= */
console.log('\n[P2] favorites server sync (live): PUT(signed) -> refresh kept -> heat +1/+5 -> DELETE')
const base0 = await siteByName(CARD0)
check('baseline site stats captured', Boolean(base0), JSON.stringify(base0))

const markPut = netlog.length
await evaluate(clickHeart(0))
const put1 = await waitFor(async () => favSince(markPut).find((r) => r.method === 'PUT' && r.status) || null, 10000)
check('heart click sends PUT /api/favorites/{id} (live)', Boolean(put1), 'no PUT in netlog')
if (put1) {
  const sign = put1.headers['X-Fav-Sign'] || put1.headers['x-fav-sign'] || ''
  check('PUT carries X-Fav-Sign (32-hex)', /^[0-9a-f]{32}$/.test(sign), sign ? '32-hex ok' : 'missing')
  let body = {}
  try {
    body = JSON.parse(put1.postData || '{}')
  } catch {
    body = {}
  }
  check('PUT body visitor_id === fv_id cookie', body.visitor_id === fvId, JSON.stringify(body))
  check(
    'PUT path is /api/favorites/{siteId}',
    /^\/api\/favorites\/\d+$/.test(new URL(put1.url).pathname),
    put1.url,
  )
  check('PUT -> 200 ok envelope', put1.status === 200, String(put1.status))
}
check('aria-pressed flips to true', (await poll(`${pressedAt(0)} === 'true'`, 8000)) === true)
check(
  'favorite written to localStorage',
  (await evaluate(`(${localFavs}).includes(${JSON.stringify(CARD0)})`)) === true,
  await evaluate(localFavs),
)

const list1 = await evaluate(serverListExpr, true)
check(
  'GET /api/favorites returns [{siteId,name}] with this site',
  Array.isArray(list1) && list1.some((it) => it.name === CARD0),
  JSON.stringify(list1),
)

const heatUp = await waitFor(async () => {
  const s = await siteByName(CARD0)
  return s && base0 && s.favoriteCount === base0.favoriteCount + 1 && s.heatScore === base0.heatScore + 5
    ? s
    : null
}, 12000)
check(
  'favorite +1 -> favorite_count+1 & heat_score+5 (live)',
  Boolean(heatUp),
  JSON.stringify({ before: base0, after: heatUp }),
)
const trackFav = netlog.filter((r) => r.url.includes('/api/track/favorite'))
check('no /api/track/favorite (防双计)', trackFav.length === 0, trackFav.map((r) => r.url).join('|'))

await navigate(`${BASE}/`)
await poll(heartsReady, 25000)
await poll(`${pressedAt(0)} === 'true'`, 8000)
check('favorite kept after refresh (local + server)', (await evaluate(pressedAt(0))) === 'true')
const listRefresh = await evaluate(serverListExpr, true)
check(
  'server list still contains it after refresh',
  Array.isArray(listRefresh) && listRefresh.some((it) => it.name === CARD0),
  JSON.stringify(listRefresh),
)
await shot('02-live-favorite-sync.png', PINK_PILL)

const markDel = netlog.length
await evaluate(clickHeart(0))
const del1 = await waitFor(async () => favSince(markDel).find((r) => r.method === 'DELETE' && r.status) || null, 10000)
check('unfavorite sends DELETE /api/favorites/{id}', Boolean(del1), 'no DELETE in netlog')
const list2 = await evaluate(serverListExpr, true)
check('GET list empty after cancel', Array.isArray(list2) && list2.length === 0, JSON.stringify(list2))
const heatBack = await waitFor(async () => {
  const s = await siteByName(CARD0)
  return s && base0 && s.favoriteCount === base0.favoriteCount && s.heatScore === base0.heatScore ? s : null
}, 12000)
check(
  'unfavorite -> counts restored to baseline (不污染热度榜)',
  Boolean(heatBack),
  JSON.stringify({ base0 }),
)

/* ================= P3 拦截 /api → 降级快照 + 提示条（不白屏） ================= */
console.log('\n[P3] blocked /api -> snapshot fallback + notice bar (no white screen)')
await send('Network.setBlockedURLs', { urls: [`${BASE}/api/*`] })
await evaluate(`(() => { localStorage.removeItem('food-nav:nav-cache'); return true })()`)
await navigate(`${BASE}/`)
const degradedOk = await waitFor(async () => {
  const state = await evaluate(`({
    banner: (document.body.textContent||'').includes('数据加载失败，显示本地快照'),
    cards: document.querySelectorAll('.food-card a[href^="http"]').length,
    root: document.getElementById('root') ? document.getElementById('root').children.length : 0,
  })`)
  return state && state.banner === true ? state : null
}, 20000)
check('degraded banner shows when /api blocked', Boolean(degradedOk), 'banner never appeared')
check(
  'snapshot cards still rendered (no white screen)',
  Boolean(degradedOk) && degradedOk.cards > 0 && degradedOk.root > 0,
  JSON.stringify(degradedOk),
)
await send('Network.setBlockedURLs', { urls: [] })
await navigate(`${BASE}/`)
await poll(heartsReady, 25000)
const bannerBack = await evaluate(degradedBanner)
check('after unblock banner gone (cache/API back)', bannerBack !== true, String(bannerBack))

/* ================= P4 AI 页「樱见」（工作台 / 流式 / 记忆会话 / 停止） ================= */
console.log('\n[P4] AI page: workspace -> stream -> memory session -> stop -> clear')
await evaluate(`(() => { localStorage.removeItem('food-nav:ask-history'); return true })()`)
await goHash('#/ask')
const wsReady = await poll(
  `(() => {
    const h1 = [...document.querySelectorAll('h1')].find(e => e.textContent.trim() === '樱见');
    const art = document.querySelector('[aria-label="樱见插画"]');
    const daily = [...document.querySelectorAll('p')].find(e => e.textContent.trim() === '今日美味');
    const recent = [...document.querySelectorAll('p')].find(e => e.textContent.trim() === '最近会话');
    return (h1 && art && daily && recent) ? true : false;
  })()`,
  20000,
)
check('workspace 樱见 renders (插画/问候/今日美味/最近会话)', wsReady === true, String(wsReady))

const headerState = await evaluate(`(() => {
  const back = document.querySelector('button[aria-label="回到主站"]');
  const clearBtn = document.querySelector('button[aria-label="清空对话"]');
  const title = [...document.querySelectorAll('header span')].find(s => s.textContent.trim() === '樱见');
  const capsule = title ? title.closest('div[class*="grid-cols-"]') : null;
  const group = title && title.parentElement ? title.parentElement : title;
  let centerDelta = null;
  if (group && capsule) {
    const t = group.getBoundingClientRect();
    const c = capsule.getBoundingClientRect();
    centerDelta = Math.round((t.x + t.width / 2) - (c.x + c.width / 2));
  }
  return { back: !!back, clear: !!clearBtn, title: !!title, centerDelta };
})()`)
check('header has 回到主站 / 清空对话 icon buttons + 樱见 title', headerState.back === true && headerState.clear === true && headerState.title === true, JSON.stringify(headerState))
check('header title centered (|Δ| ≤ 2px)', headerState.centerDelta !== null && Math.abs(headerState.centerDelta) <= 2, JSON.stringify(headerState.centerDelta))

const guideText = await evaluate(`(document.body.textContent||'').includes('聊聊今天想吃什么吧')`)
check('recent-session panel shows empty-state guide (fresh)', guideText === true, String(guideText))
await shot('03-live-ask-workspace.png', ASK_H1)

const QUESTION = '推荐三个适合新手的烘焙配方，简短说明即可'
const askSet = (text) =>
  evaluate(`(() => {
    const ta = document.querySelector('textarea[aria-label="提问输入框"]');
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${JSON.stringify(text)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true })()`)
const askSend = () =>
  evaluate(`(() => { const b = document.querySelector('button.ask-send'); if (b && !b.disabled) { b.click(); return true } return false })()`)
const stopVisible = () =>
  evaluate(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('停止'))`)

const aiMark = netlog.length
check('composer accepts question', (await poll(`!!document.querySelector('textarea[aria-label="提问输入框"]')`, 8000)) === true)
await askSet(QUESTION)
await sleep(200)
check('send button enabled & clicked', (await askSend()) === true)
const streamingSeen = await waitFor(async () => (await stopVisible()) === true, 10000)
check('streaming UI appears (停止 button)', streamingSeen === true, 'stop button never showed')

const aiReq = await waitFor(
  async () => sliceFrom(aiMark).find((r) => r.url.includes('/api/ai/chat') && r.status) || null,
  20000,
)
check('POST /api/ai/chat -> 200', Boolean(aiReq) && aiReq.status === 200, JSON.stringify({ status: aiReq?.status }))
check(
  'response is SSE (text/event-stream) from GLM',
  Boolean(aiReq) && aiReq.contentType.includes('text/event-stream'),
  aiReq?.contentType || 'missing',
)

const aiDone = await waitFor(async () => {
  const state = await evaluate(`(() => {
    const ai = [...document.querySelectorAll('.ask-bubble-ai')];
    const last = ai[ai.length - 1];
    const streaming = [...document.querySelectorAll('button')].some(b => b.textContent.includes('停止'));
    const suggestChips = [...document.querySelectorAll('button.ask-chip')].length;
    const recommendCards = document.querySelectorAll('.ask-card').length;
    const pureChat = !document.querySelector('aside') && !!document.querySelector('.ask-scroll');
    return { n: ai.length, len: last ? last.textContent.trim().length : 0, streaming, suggestChips, recommendCards, pureChat };
  })()`)
  return state && state.n >= 1 && state.streaming === false && state.len > 10 ? state : null
}, 90000)
check('GLM stream completes with non-empty answer', Boolean(aiDone), JSON.stringify(aiDone))
if (aiDone) {
  check('pure chat state (no aside, single column)', aiDone.pureChat === true, JSON.stringify(aiDone))
  check(
    'suggestion chips or recommend cards rendered',
    aiDone.suggestChips > 0 || aiDone.recommendCards > 0,
    JSON.stringify({ chips: aiDone.suggestChips, cards: aiDone.recommendCards }),
  )
}

const historySaved = await waitFor(async () => {
  const raw = await evaluate(`localStorage.getItem('food-nav:ask-history')`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed.messages) && parsed.messages.length >= 2 ? parsed : null
  } catch {
    return null
  }
}, 8000)
check('memory session written (food-nav:ask-history)', Boolean(historySaved), 'not written')

await goHash('#/')
await poll(heartsReady, 20000)
await goHash('#/ask')
const restored = await waitFor(async () => {
  const state = await evaluate(`(() => {
    const user = [...document.querySelectorAll('.ask-bubble-me')];
    const ai = [...document.querySelectorAll('.ask-bubble-ai')];
    return { u: user.length, a: ai.length, first: user[0] ? user[0].textContent.trim() : '', aiLen: ai[0] ? ai[0].textContent.trim().length : 0 };
  })()`)
  return state && state.u >= 1 && state.a >= 1 && state.aiLen > 5 ? state : null
}, 12000)
check(
  'memory session restored after leaving & returning',
  Boolean(restored) && restored.first === QUESTION,
  JSON.stringify(restored),
)

const stopMark = netlog.length
await askSet('请写一段较长的家常红烧肉做法，步骤越详细越好')
await sleep(200)
await askSend()
const caught = await waitFor(async () => (await stopVisible()) === true, 12000)
check('second stream starts (stop reachable)', caught === true, 'stream too fast or failed')
if (caught) {
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('停止')); if (b) { b.click(); return true } return false })()`)
  const stopped = await waitFor(
    async () => evaluate(`(document.body.textContent||'').includes('（已停止生成）')`),
    10000,
  )
  check('stop button aborts stream (已停止生成)', stopped === true, 'stop marker not found')
} else {
  const aiAgain = sliceFrom(stopMark).find((r) => r.url.includes('/api/ai/chat'))
  note(`stop window missed; ai request=${JSON.stringify({ status: aiAgain?.status })}`)
}

await poll(`!document.querySelector('button[aria-label="清空对话"]').disabled`, 5000)
await evaluate(`(() => { const b = document.querySelector('button[aria-label="清空对话"]'); if (b) b.click(); return true })()`)
const cleared = await waitFor(async () => {
  const state = await evaluate(`({
    workspace: !!([...document.querySelectorAll('h1')].find(e => e.textContent.trim() === '樱见')),
    chat: document.querySelectorAll('.ask-bubble-ai').length,
    history: localStorage.getItem('food-nav:ask-history'),
  })`)
  return state && state.workspace === true && state.chat === 0 ? state : null
}, 8000)
check('清空对话 returns to workspace & clears history', Boolean(cleared) && !cleared.history, JSON.stringify(cleared))

/* ================= P5 admin（登录 / 热度榜 / 统计 / 检测 / 打标 / UV） ================= */
console.log('\n[P5] admin: login -> heat board (live favorite) -> stats -> checks -> tagging')
// 先回主站给 Top 热度站收藏（看板行可见 +1/+5）
const heatList = (await apiJson('/api/sites?status=all&sort=heat')).payload?.data || []
check('?sort=heat returns heat desc list', heatList.length > 0 && heatList.every((s, i) => i === 0 || heatList[i - 1].heatScore >= s.heatScore), `n=${heatList.length}`)
const activeSet = new Set(activeSites.map((s) => s.id))
const heatTarget = heatList.find((s) => activeSet.has(s.id)) || heatList[0]
const baseT = await siteByName(heatTarget.name)
note(`heat board target = ${heatTarget.name} (id ${heatTarget.id})`)

await goHash('#/')
await poll(heartsReady, 25000)
await ensureAllCards(apiCardCount)
const tIndex = await poll(`(() => { const want = ${JSON.stringify(heatTarget.name)}; const bs = ${HEARTS}; return bs.findIndex(b => { const l = b.getAttribute('aria-label') || ''; return l === ('收藏 ' + want) || l === ('取消收藏 ' + want); }) >= 0 })()`, 12000)
check('target heat site has a heart on main site', tIndex === true, String(tIndex))
const markT = netlog.length
let tIdx = await findHeartIndex(heatTarget.name)
if (tIdx < 0) {
  await ensureAllCards(apiCardCount)
  tIdx = await findHeartIndex(heatTarget.name)
}
check('target heart index found', tIdx >= 0, String(tIdx))
await evaluate(clickHeart(tIdx))
const putT = await waitFor(async () => favSince(markT).find((r) => r.method === 'PUT' && r.status) || null, 10000)
check('target favorite PUT sent', Boolean(putT), 'no PUT')
const tUp = await waitFor(async () => {
  const s = await siteByName(heatTarget.name)
  return s && baseT && s.favoriteCount === baseT.favoriteCount + 1 && s.heatScore === baseT.heatScore + 5 ? s : null
}, 12000)
check('target stats +1 / +5 before board read', Boolean(tUp), JSON.stringify({ baseT, tUp }))

await goHash('#/admin')
await ensureAdmin()
const dashReady = await poll(
  `(() => {
    const h = [...document.querySelectorAll('h2')].find(x => x.textContent.includes('站点热度榜'));
    return !!(h && h.closest('section') && h.closest('section').querySelector('tbody tr'));
  })()`,
  20000,
)
check('admin dashboard shows 站点热度榜 with rows', dashReady === true, String(dashReady))
const board = await readHeatBoard()
check(
  'board columns #/站点/分类/收藏/点击/热度',
  Boolean(board) && board.head.join('|') === '#|站点|分类|收藏|点击|热度',
  board ? board.head.join('|') : 'null',
)
check('board rows 1..10', Boolean(board) && board.rows.length > 0 && board.rows.length <= 10, String(board?.rows.length))
check(
  'heat column highlighted (text-food-primary)',
  Boolean(board) && board.rows.some((row) => (row[5]?.cls || '').includes('text-food-primary')),
  JSON.stringify(board?.rows?.[0]?.[5]),
)
const boardRowT = board ? board.rows.find((row) => row[1]?.text === heatTarget.name) : null
check(
  'board row reflects live favorite (+1/+5)',
  Boolean(boardRowT) &&
    boardRowT[3]?.text === String(baseT.favoriteCount + 1) &&
    boardRowT[5]?.text === String(baseT.heatScore + 5),
  JSON.stringify({ row: boardRowT && [boardRowT[3]?.text, boardRowT[5]?.text], want: [baseT.favoriteCount + 1, baseT.heatScore + 5] }),
)
const heatNow = (await apiJson('/api/sites?status=all&sort=heat')).payload?.data || []
const topLive = heatNow[0]
check(
  'board row0 matches live API top site',
  Boolean(board) && Boolean(topLive) && board.rows[0][1]?.text === topLive.name && board.rows[0][5]?.text === String(topLive.heatScore),
  JSON.stringify({ row0: board?.rows?.[0], topLive }),
)
await evaluate(`(() => { const h = [...document.querySelectorAll('h2')].find(x => x.textContent.includes('站点热度榜')); if (h) h.scrollIntoView({ block: 'center' }); return true })()`)
await sleep(400)
await shot('04-live-heat-board.png', HEAT_TD)

const uvCard = await evaluate(`(() => {
  const p = [...document.querySelectorAll('p')].find(e => e.textContent.trim() === '今日访问');
  if (!p) return null;
  const card = p.closest('div');
  const value = card ? card.querySelector('p.font-display, p[class*="text-page-title"]') : null;
  return value ? value.textContent.trim() : null;
})()`)
check('dashboard 今日访问 UV present (daily_visits live)', uvCard !== null && uvCard !== '…' && Number(uvCard) >= 1, String(uvCard))

// 立刻取消收藏还原（缩短污染窗口）
await goHash('#/')
await poll(heartsReady, 25000)
const tIdx2 = await findHeartIndex(heatTarget.name)
await evaluate(clickHeart(tIdx2))
const tBack = await waitFor(async () => {
  const s = await siteByName(heatTarget.name)
  return s && baseT && s.favoriteCount === baseT.favoriteCount && s.heatScore === baseT.heatScore ? s : null
}, 12000)
check('target favorite cancelled & stats restored', Boolean(tBack), JSON.stringify({ baseT }))

await goHash('#/admin')
await ensureAdmin()

// 访问统计
check('tab 访问统计 clickable', (await clickTab('访问统计')) === true)
const statsReady = await poll(
  `(() => {
    const labels = ['今日 UV', '昨日 UV', '近 30 天峰值'].every(t => (document.body.textContent||'').includes(t));
    const chart = [...document.querySelectorAll('h2')].find(h => h.textContent.includes('近 30 天访问趋势'));
    const svg = chart ? !!chart.closest('section').querySelector('svg') : false;
    return labels && svg;
  })()`,
  15000,
)
check('访问统计: UV cards + SVG trend chart', statsReady === true, String(statsReady))
const todayUvText = await evaluate(`(() => {
  const p = [...document.querySelectorAll('p')].find(e => e.textContent.trim() === '今日 UV');
  const card = p ? p.closest('div') : null;
  const v = card ? card.querySelector('p[class*="text-page-title"]') : null;
  return v ? v.textContent.trim() : null;
})()`)
check('今日 UV >= 1 (page visit counted)', Number(todayUvText) >= 1, String(todayUvText))

// 检测中心
check('tab 检测中心 clickable', (await clickTab('检测中心')) === true)
const checksReady = await poll(
  `(() => {
    const h1 = [...document.querySelectorAll('h2')].find(h => h.textContent.includes('链接存活检测'));
    const h2 = [...document.querySelectorAll('h2')].find(h => h.textContent.includes('最近检测日志'));
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '开始检测');
    return (h1 && h2 && btn) ? true : false;
  })()`,
  15000,
)
check('检测中心 renders (链接存活检测 + 开始检测 + 日志区)', checksReady === true, String(checksReady))
const logRows = await poll(
  `(() => {
    const h2 = [...document.querySelectorAll('h2')].find(h => h.textContent.includes('最近检测日志'));
    const sec = h2 ? h2.closest('section') : null;
    return sec ? sec.querySelectorAll('tbody tr').length : 0;
  })()`,
  15000,
)
check('check logs loaded from live D1 (rows > 0)', Number(logRows) > 0, String(logRows))
const checkHint = await evaluate(`(document.querySelector('[data-testid="check-progress"]')?.textContent || '').trim()`)
note(`check center hint: ${checkHint.slice(0, 60)}`)

// 站点管理 + 打标（改→验→还原）
check('tab 站点管理 clickable', (await clickTab('站点管理')) === true)
const sitesTableReady = await poll(
  `(() => {
    const th = [...document.querySelectorAll('thead th')].map(t => t.textContent.trim());
    return th.join('|') === '站点|分类|链接|角标|排序|状态|操作';
  })()`,
  15000,
)
check('site table columns intact', sitesTableReady === true, String(sitesTableReady))

const normTag = (t) => (t === undefined || t === null || t === '' ? '' : String(t))
const originalTag = normTag((await siteByName(heatTarget.name))?.tag)
check(
  'original tag captured (no pollution baseline)',
  originalTag === null || typeof originalTag === 'string',
  JSON.stringify(originalTag),
)
const TAG_PRESETS = ['热门', '新品', '推荐']
const newTag = originalTag === '热门' ? '新品' : '热门'

const openEdit = (name) =>
  evaluate(`(() => {
    const rows = [...document.querySelectorAll('tbody tr')];
    const row = rows.find(tr => (tr.textContent||'').includes(${JSON.stringify(name)}));
    if (!row) return false;
    const btn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '编辑');
    if (!btn) return false; btn.click(); return true })()`)
const setTagSelect = (value) =>
  evaluate(`(() => {
    const sel = document.querySelector('select[aria-label="角标快捷打标"]');
    if (!sel) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, ${JSON.stringify(value)});
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true })()`)
const setTagInput = (value) =>
  evaluate(`(() => {
    const sel = document.querySelector('select[aria-label="角标快捷打标"]');
    const input = sel ? sel.parentElement.querySelector('input[maxlength="10"]') : null;
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true })()`)
const saveForm = () =>
  evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('保存'));
    if (!b || b.disabled) return false; b.click(); return true })()`)
const formClosed = async () =>
  (await poll(`!document.querySelector('select[aria-label="角标快捷打标"]')`, 12000)) === true

check('open edit form for target site', (await poll(`(() => { const rows=[...document.querySelectorAll('tbody tr')]; const row=rows.find(tr => (tr.textContent||'').includes(${JSON.stringify(heatTarget.name)})); return !!row })()`, 8000)) === true && (await openEdit(heatTarget.name)) === true)
const formOpen = await poll(`!!document.querySelector('select[aria-label="角标快捷打标"]')`, 12000)
check('edit form open (角标快捷打标 present)', formOpen === true, String(formOpen))
check('quick tag select set', (await setTagSelect(newTag)) === true)
check('save clicked', (await saveForm()) === true)
check('form closed after save', await formClosed())
const tagged = await waitFor(async () => {
  const s = await siteByName(heatTarget.name)
  return s && s.tag === newTag ? s : null
}, 10000)
check(`tag applied via quick select (${newTag})`, Boolean(tagged), JSON.stringify({ now: (await siteByName(heatTarget.name))?.tag, newTag }))

check('reopen edit to restore tag', (await openEdit(heatTarget.name)) === true)
const formOpen2 = await poll(`!!document.querySelector('select[aria-label="角标快捷打标"]')`, 12000)
check('edit form reopened', formOpen2 === true, String(formOpen2))
let restoreSetter = false
if (originalTag && !TAG_PRESETS.includes(originalTag)) restoreSetter = await setTagInput(originalTag || '')
else restoreSetter = await setTagSelect(originalTag || '')
check('restore value applied', restoreSetter === true)
check('save (restore) clicked', (await saveForm()) === true)
check('form closed after restore save', await formClosed())
const restoredTag = await waitFor(async () => {
  const s = await siteByName(heatTarget.name)
  return s && (s.tag ?? null) === (originalTag || null) ? s : null
}, 10000)
check('tag restored to original (线上数据不污染)', Boolean(restoredTag), JSON.stringify({ originalTag, now: (await siteByName(heatTarget.name))?.tag }))

/* ================= P6 375 移动端（主站 / AI / 看板 无横向溢出） ================= */
console.log('\n[P6] 375 viewport: main / ask / board no horizontal overflow')
await setViewport(375, 812, true)
await navigate(`${BASE}/`)
await poll(heartsReady, 25000)
const ovHome = await evaluate(`({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth })`)
check('main site no horizontal overflow @375', ovHome.doc <= 375 && ovHome.body <= 375, JSON.stringify(ovHome))
await shot('05-live-mobile-375.png', PINK_PILL)

await goHash('#/ask')
const askWs375 = await poll(`!!([...document.querySelectorAll('h1')].find(e => e.textContent.trim() === '樱见'))`, 15000)
check('ask workspace renders @375', askWs375 === true, String(askWs375))
const ovAsk = await evaluate(`({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth })`)
check('ask page no horizontal overflow @375', ovAsk.doc <= 375 && ovAsk.body <= 375, JSON.stringify(ovAsk))

await goHash('#/admin')
await ensureAdmin()
const board375 = await poll(
  `(() => {
    const h = [...document.querySelectorAll('h2')].find(x => x.textContent.includes('站点热度榜'));
    return !!(h && h.closest('section').querySelector('.overflow-x-auto'));
  })()`,
  20000,
)
const ovAdmin = await evaluate(`({ doc: document.documentElement.scrollWidth, inner: window.innerWidth })`)
check('admin board table container exists @375', board375 === true, String(board375))
check('admin page no horizontal overflow @375', ovAdmin.doc <= 375 && ovAdmin.inner === 375, JSON.stringify(ovAdmin))
await setViewport(1280, 860, false)

/* ================= P7 暗色模式（主站 / AI / admin token） ================= */
console.log('\n[P7] dark mode: main + ask + admin tokens')
await navigate(`${BASE}/`)
await poll(heartsReady, 25000)
const lightBg = await evaluate(`getComputedStyle(document.body).backgroundColor`)
await evaluate(`(() => { const b = [...document.querySelectorAll('header button')].find(x => (x.getAttribute('aria-label')||'').includes('主题')); if (b) b.click(); return !!b })()`)
await sleep(400)
const darkOn = await evaluate(`document.documentElement.classList.contains('dark')`)
const darkBg = await evaluate(`getComputedStyle(document.body).backgroundColor`)
check('dark mode toggles on (main)', darkOn === true && darkBg !== lightBg, JSON.stringify({ lightBg, darkBg }))

await goHash('#/ask')
const askDark = await poll(
  `(() => {
    if (!document.documentElement.classList.contains('dark')) return false;
    const page = document.querySelector('.ask-page');
    return !!page && getComputedStyle(page).backgroundColor !== '';
  })()`,
  15000,
)
check('ask page dark tokens applied', askDark === true, String(askDark))

await goHash('#/admin')
await ensureAdmin()
const darkBoard = await poll(
  `(() => {
    const h = [...document.querySelectorAll('h2')].find(x => x.textContent.includes('站点热度榜'));
    if (!h) return false;
    const cell = [...h.closest('section').querySelectorAll('tbody td')].find(td => (td.className||'').includes('text-food-primary'));
    if (!cell) return false;
    const color = getComputedStyle(cell).color;
    return !!color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent';
  })()`,
  20000,
)
check('heat board token ok in dark mode', darkBoard === true, String(darkBoard))

await navigate(`${BASE}/`)
await poll(heartsReady, 25000)
await shot('06-live-dark.png', PINK_PILL)

/* ================= P8 收尾还原 ================= */
console.log('\n[P8] restore online data')
{
  const darkNow = await evaluate(`document.documentElement.classList.contains('dark')`)
  if (darkNow) {
    await evaluate(`(() => { const b = [...document.querySelectorAll('header button')].find(x => (x.getAttribute('aria-label')||'').includes('主题')); if (b) b.click(); return true })()`)
    await sleep(400)
  }
  const lightBack = await evaluate(`!document.documentElement.classList.contains('dark')`)
  check('theme restored to light', lightBack === true)

  const fvEnd = await evaluate(FV_EXPR)
  const finalList = await evaluate(serverListExpr, true)
  check('final server favorites list empty', Array.isArray(finalList) && finalList.length === 0, JSON.stringify(finalList))

  const c0 = await siteByName(CARD0)
  check(
    'card0 stats == baseline (restored)',
    Boolean(c0) && Boolean(base0) && c0.favoriteCount === base0.favoriteCount && c0.heatScore === base0.heatScore,
    JSON.stringify({ base0, c0 }),
  )
  const tEnd = await siteByName(heatTarget.name)
  check(
    'heat target stats == baseline (restored)',
    Boolean(tEnd) && Boolean(baseT) && tEnd.favoriteCount === baseT.favoriteCount && tEnd.heatScore === baseT.heatScore,
    JSON.stringify({ baseT, tEnd }),
  )

  await evaluate(`(() => { localStorage.removeItem('food-nav:ask-history'); localStorage.removeItem('food-nav:admin-token'); return true })()`)
  const noHistory = await evaluate(`!localStorage.getItem('food-nav:ask-history') && !localStorage.getItem('food-nav:admin-token')`)
  check('ask-history + admin token cleared (local cleanup)', noHistory === true, String(noHistory))
  note(`final fv_id=${fvEnd}`)
}

/* ================= 证据落盘 ================= */
const netlogText = [
  '# task-17 NetLog 证据（CDP Network，线上 food-nav.shiora.cc；URL 含 /api/favorites、/api/track 或 /api/ai）',
  `# fv_id=${fvId} · 时间 ${new Date().toISOString()}`,
  '',
  ...netlog
    .filter(
      (r) =>
        r.url.includes('/api/favorites') ||
        r.url.includes('/api/track/') ||
        r.url.includes('/api/ai/chat'),
    )
    .map((r) =>
      [
        `${r.method} ${r.url}`,
        `  status: ${r.status ?? '(pending)'}`,
        `  content-type: ${r.contentType || '-'}`,
        `  X-Fav-Sign: ${r.headers['X-Fav-Sign'] || r.headers['x-fav-sign'] || '-'}`,
        `  body: ${r.postData || '-'}`,
      ].join('\n'),
    ),
  '',
  '# 说明：PUT/DELETE 均带 X-Fav-Sign(32-hex) 与 body.visitor_id=fv_id；',
  '#       GET /api/favorites 为初始化同步；/api/ai/chat 为 GLM SSE 流式；',
  '#       全程无 /api/track/favorite（M9 停用防双计）；测毕收藏全部取消还原。',
].join('\n')
await writeFile(`${OUT}/netlog-live.txt`, netlogText)

const summary = [
  `# task-17 线上回归日志 · ${new Date().toISOString()}`,
  `# target=${target.url} · live=${BASE} · fv_id=${fvId}`,
  '',
  ...results,
  '',
  ...notes.map((n) => `# ${n}`),
  '',
  `RESULT: ${pass} passed / ${fail} failed`,
].join('\n')
await writeFile(`${OUT}/acceptance-log.txt`, summary)

await restoreAll(false)
console.log(`\nRESULT: ${pass} passed / ${fail} failed`)
try {
  ws.close()
} catch {
  /* ignore */
}
process.exit(fail > 0 ? 1 : 0)
