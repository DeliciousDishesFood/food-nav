// task-18 · M9-T2 分级修正上线后线上验收（CDP 浏览器回归 + 截图）
// 访问 https://food-nav.shiora.cc（线上）；前置：Edge --remote-debugging-port=9222 + 独立 --user-data-dir
// 用法：node dev-docs/reports/task-18/t18-live.mjs
// 证据：live-checks.txt · 01~03 截图
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const BASE = 'https://food-nav.shiora.cc'
const CDP = 'http://127.0.0.1:9222'
const ROOT = 'E:/react/food-nav'
const OUT = `${ROOT}/dev-docs/reports/task-18`

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
if (!ADMIN_PASS) {
  console.error('FATAL: .dev.vars 缺少 ADMIN_PASSWORD')
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
  target = await (await fetch(`${CDP}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json()
}
console.log(`CDP target: ${target.url}`)

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = (e) => reject(new Error(`ws connect failed: ${e.message || e}`))
})
let msgId = 0
const pending = new Map()
ws.onmessage = (event) => {
  const msg = JSON.parse(String(event.data))
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)))
    else resolve(msg.result)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = (msgId += 1)
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

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
    return cur.origin === want.origin && cur.pathname === want.pathname && state.ready === 'complete'
  }, 25000)
  if (!ok) note(`navigate slow/timeout: ${url}`)
  await sleep(500)
}
const shot = async (file, probe) => {
  const res = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${OUT}/${file}`, Buffer.from(res.data, 'base64'))
  note(`screenshot → ${file}`)
  if (!probe) return
  const out = await evaluate(
    `(async () => {
      const img = new Image()
      img.src = 'data:image/png;base64,${res.data}'
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const g = c.getContext('2d'); g.drawImage(img, 0, 0)
      const el = (${probe.elExpr})
      if (!el) return { err: 'probe element not found' }
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const src = ${probe.colorFrom === 'backgroundColor' ? 'cs.backgroundColor' : 'cs.color'}
      const m = (src.match(/\\d+/g) || []).slice(0, 3).map(Number)
      if (m.length < 3) return { err: 'no rgb color: ' + src }
      const sx = img.width / window.innerWidth, sy = img.height / window.innerHeight
      const x = Math.max(0, Math.round(r.x * sx)), y = Math.max(0, Math.round(r.y * sy))
      const w = Math.max(0, Math.min(img.width - x, Math.round(r.width * sx)))
      const h = Math.max(0, Math.min(img.height - y, Math.round(r.height * sy)))
      if (!w || !h) return { err: 'empty rect' }
      const data = g.getImageData(x, y, w, h).data
      let count = 0
      for (let i = 0; i < data.length; i += 4) {
        const dr = data[i] - m[0], dg = data[i + 1] - m[1], db = data[i + 2] - m[2]
        if (dr * dr + dg * dg + db * db < 2025) count += 1
      }
      const inView = r.x >= -1 && r.y >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1
      return { count, px: w * h, ratio: +(count / (w * h)).toFixed(3), rgb: m, inView }
    })()`,
    true,
  )
  check(
    `shot ${file}: pixel probe`,
    Boolean(out) && !out.err && out.inView === true && out.count >= probe.minCount,
    JSON.stringify(out),
  )
}
const PINK_PILL = {
  elExpr: `[...document.querySelectorAll('.bg-food-primary')].find(e => e.textContent.includes('全部'))`,
  colorFrom: 'backgroundColor',
  minCount: 1500,
}
const setViewport = (width, height, mobile = false) =>
  send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile })

const CARDS = `document.querySelectorAll('.food-card a[href^="http"]').length`
const cardNames = `(() => [...document.querySelectorAll('.food-card')].map(c => (c.querySelector('h3, .font-rounded, a')?.textContent || c.textContent || '').trim().slice(0, 30)))()`

async function ensureAllCards(expectCount) {
  await evaluate(`(() => { document.documentElement.style.scrollBehavior='auto'; document.body.style.scrollBehavior='auto'; return true })()`)
  for (let i = 0; i < 80; i += 1) {
    const count = await evaluate(CARDS)
    if (count >= expectCount) break
    await evaluate(`window.scrollBy(0, Math.max(300, Math.round(window.innerHeight * 0.8)))`)
    await sleep(250)
  }
  await evaluate(`window.scrollTo(0, document.body.scrollHeight)`)
  await sleep(500)
  const ok = await poll(`${CARDS} >= ${expectCount}`, 10000)
  await evaluate(`window.scrollTo(0, 0)`)
  await sleep(400)
  return ok ? expectCount : (await evaluate(CARDS))
}

mkdir(OUT, { recursive: true }).catch(() => {})
await send('Page.enable')
await send('Runtime.enable')

/* 可见性护栏：hidden 页面会被 Chromium 节流 IO/定时器 */
await send('Page.bringToFront').catch(() => {})
const visibleOk = await waitFor(async () => {
  const state = await evaluate(`document.visibilityState`).catch(() => null)
  if (state !== 'visible') return false
  const tick = await evaluate(`new Promise(r => setTimeout(() => r(1), 150))`, true).catch(() => null)
  return tick === 1
}, 8000)
if (!visibleOk) {
  console.error('FATAL: 浏览器页面 hidden（被遮挡/最小化）——IO 与定时器被节流，请让测试窗口回前台重跑')
  process.exit(1)
}
note('page visible + timers not throttled')

/* ================= P1 主站恢复 24 站 ================= */
console.log('\n[P1] 主站恢复（24 active）')
await navigate(`${BASE}/`)
await setViewport(1280, 860)
const activeCount = await fetch(`${BASE}/api/sites?status=active`)
  .then((r) => r.json())
  .then((p) => (p.data || []).length)
  .catch(() => -1)
check('GET /api/sites?status=active = 24', activeCount === 24, String(activeCount))

const rendered = await ensureAllCards(activeCount)
check(`首页卡片渲染 == active 数（${rendered}/${activeCount}）`, rendered === activeCount, `${rendered}/${activeCount}`)

const names = (await evaluate(cardNames)) || []
check('首页含豆果美食（403 误判已复活）', names.some((n) => n.includes('豆果')), JSON.stringify(names.slice(0, 5)))
check('首页含君之烘焙（B 站 403 误判已复活）', names.some((n) => n.includes('君之')), JSON.stringify(names.slice(0, 8)))
const deadNames = names.filter((n) => /Tinrry|甜品实验|冰淇淋星球/.test(n))
check('3 个真死链已隐藏（不在首页）', deadNames.length === 0, JSON.stringify(deadNames))

const degraded = await evaluate(`(document.body.textContent || '').includes('数据加载失败，显示本地快照')`)
check('无降级条（数据加载失败/本地快照）', degraded === false, String(degraded))

await shot('01-live-home-24cards.png', PINK_PILL)

/* ================= P2 搜索 ================= */
console.log('\n[P2] 搜索')
{
  const typed = await evaluate(`(() => {
    const i = document.querySelector('input[placeholder*="搜一搜"]')
    if (!i) return false
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    s.call(i, '豆')
    i.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await sleep(600)
  const filtered = typed ? await evaluate(CARDS) : -1
  check('搜索「豆」过滤出结果（< 全量且 ≥1）', filtered >= 1 && filtered < activeCount, String(filtered))
  await evaluate(`(() => {
    const i = document.querySelector('input[placeholder*="搜一搜"]')
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    s.call(i, '')
    i.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await sleep(600)
  const restored = await ensureAllCards(activeCount)
  check('清空搜索恢复全量卡片', restored === activeCount, String(restored))
}

/* ================= P3 分类切换 ================= */
console.log('\n[P3] 分类切换')
{
  const clicked = await evaluate(`(() => {
    const b = [...document.querySelectorAll('main button')].find(x => x.textContent.includes('烘焙甜点'))
    if (!b) return false
    b.click()
    return true
  })()`)
  await sleep(700)
  const baking = clicked ? await ensureAllCards(1) : 0
  check('切到「烘焙甜点」渲染出卡片', clicked && baking >= 1, `clicked=${clicked} cards=${baking}`)
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('main button')].find(x => x.textContent.includes('全部'))
    if (b) b.click()
    return true
  })()`)
  await sleep(700)
  const back = await ensureAllCards(activeCount)
  check('切回「全部」恢复 24 卡片', back === activeCount, String(back))
}

/* ================= P4 收藏 + 主题 ================= */
console.log('\n[P4] 收藏 / 主题')
{
  const pressedBefore = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button[aria-pressed]')].find(b => /^收藏\\s/.test(b.getAttribute('aria-label')||''))
    return b ? b.getAttribute('aria-pressed') : null })()`)
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button[aria-pressed]')].find(b => /^收藏\\s/.test(b.getAttribute('aria-label')||''))
    if (b) b.click(); return !!b })()`)
  await sleep(700)
  const pressedAfter = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button[aria-pressed]')].find(b => /收藏\\s/.test(b.getAttribute('aria-label')||''))
    return b ? b.getAttribute('aria-pressed') : null })()`)
  check('点击爱心 → aria-pressed=true', pressedAfter === 'true', `${pressedBefore} -> ${pressedAfter}`)
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button[aria-pressed]')].find(b => /^取消收藏\\s/.test(b.getAttribute('aria-label')||''))
    if (b) b.click(); return !!b })()`)
  await sleep(700)
  const undone = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button[aria-pressed]')].find(b => /^收藏\\s/.test(b.getAttribute('aria-label')||''))
    return b ? b.getAttribute('aria-pressed') : null })()`)
  check('再点一次取消收藏（还原，不留脏数据）', undone !== 'true', String(undone))

  const themeOn = await evaluate(`(() => {
    const b = document.querySelector('button[aria-label^="切换到"]')
    if (!b) return false
    b.click()
    return true })()`)
  await sleep(500)
  const dark = await evaluate(`document.documentElement.classList.contains('dark')`)
  check('主题切换 → html.dark', themeOn === true && dark === true, `clicked=${themeOn} dark=${dark}`)
  await evaluate(`(() => {
    const b = document.querySelector('button[aria-label^="切换到"]')
    if (b) b.click()
    return true })()`)
  await sleep(500)
  const lightBack = await evaluate(`!document.documentElement.classList.contains('dark')`)
  check('主题还原为亮色', lightBack === true, String(lightBack))
}

/* ================= P5 375 无溢出 + 截图 ================= */
console.log('\n[P5] 375 视口')
await setViewport(375, 812, true)
await sleep(700)
await ensureAllCards(activeCount)
const overflow = await evaluate(`({
  scrollW: document.documentElement.scrollWidth,
  innerW: window.innerWidth,
  bodyW: document.body.scrollWidth,
})`)
check(
  '375 无横向溢出',
  Boolean(overflow) && overflow.scrollW <= overflow.innerW + 1,
  JSON.stringify(overflow),
)
await shot('02-live-mobile-375.png', PINK_PILL)
await setViewport(1280, 860)
await sleep(400)

/* ================= P6 管理端检测日志（分级证据） ================= */
console.log('\n[P6] 管理端 · 检测中心日志')
await navigate(`${BASE}/admin`)
const loggedIn = await waitFor(async () => {
  if (await evaluate(`!!document.querySelector('input[type="password"]')`)) {
    await evaluate(`(() => {
      const i = document.querySelector('input[type="password"]')
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      s.call(i, ${JSON.stringify(ADMIN_PASS)})
      i.dispatchEvent(new Event('input', { bubbles: true }))
      const f = document.querySelector('form')
      if (f) f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      return true
    })()`)
  }
  return evaluate(`(document.body.textContent || '').includes('登出')`)
}, 20000)
check('管理端登录成功', loggedIn === true, String(loggedIn))

const toChecks = await evaluate(`(() => {
  const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '检测中心')
  if (!b) return false
  b.click()
  return true
})()`)
await sleep(1500)
check('进入「检测中心」', toChecks === true, String(toChecks))

const logsReady = await poll(
  `(document.body.textContent || '').includes('最近检测日志') && document.querySelectorAll('tbody tr').length > 0`,
  15000,
)
check('最近检测日志有数据', logsReady === true, String(logsReady))
const logText = (await evaluate(`(() => {
  const h = [...document.querySelectorAll('h2')].find(x => x.textContent.includes('最近检测日志'))
  const sec = h ? h.closest('section') || h.parentElement : null
  return sec ? sec.textContent.slice(0, 4000) : ''
})()`)) || ''
check('日志含新分级 note「反爬拦截但站点可达」', logText.includes('反爬拦截但站点可达'), logText.slice(0, 200))
check('日志含新分级 note「源站不可达」', logText.includes('源站不可达'), logText.slice(0, 200))
check('日志已无「可疑档」旧文案', !logText.includes('可疑档'), logText.slice(0, 200))
await shot('03-admin-check-logs.png')

/* ================= 汇总 ================= */
const summaryLine = `RESULT: ${pass} passed / ${fail} failed`
console.log(`\n${summaryLine}`)
results.push('', summaryLine)
await writeFile(
  `${OUT}/live-checks.txt`,
  `# task-18 · 线上主站回归 + 截图证据 · ${new Date().toISOString()}\n# ${BASE} · CDP ${CDP}\n\n${results.join('\n')}\n\n# notes\n${notes.join('\n')}\n`,
  'utf8',
)
console.log(`written: ${OUT}/live-checks.txt`)
process.exit(fail > 0 ? 1 : 0)
