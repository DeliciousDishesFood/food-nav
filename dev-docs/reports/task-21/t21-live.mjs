// task-21 · 线上 CDP 验收 + 截图（主站 27 站 / admin 豁免开关与徽标 / 375 / 暗色）
// 前置：Edge --remote-debugging-port=9222 + 独立 --user-data-dir（窗口必须前台可见）
// 用法：node dev-docs/reports/task-21/t21-live.mjs
// 证据：live-checks.txt · 01/01a/02/03/04 截图
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const BASE = 'https://food-nav.shiora.cc'
const CDP = 'http://127.0.0.1:9222'
const ROOT = 'E:/react/food-nav'
const OUT = `${ROOT}/dev-docs/reports/task-21`

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
let target =
  targets.find((t) => t.type === 'page' && t.url.startsWith('https://food-nav.shiora.cc')) ||
  targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools://') && !t.url.startsWith('edge://'))
if (!target) {
  target = await (await fetch(`${CDP}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' })).json()
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
/** 带轮询日志的等待（用于 P5/P6 现场诊断） */
const waitForLogged = async (label, probe, timeoutMs, logEvery = 3000) => {
  const start = Date.now()
  let lastLog = 0
  let lastErr = null
  for (;;) {
    let value = null
    const t0 = Date.now()
    try {
      value = await probe()
    } catch (e) {
      lastErr = String(e && e.message)
    }
    const dt = Date.now() - t0
    if (value) {
      note(`${label} poll ok after ${((Date.now() - start) / 1000).toFixed(1)}s (probe ${dt}ms)`)
      return value
    }
    if (Date.now() - start > timeoutMs) {
      note(`${label} poll timeout after ${((Date.now() - start) / 1000).toFixed(1)}s (lastErr=${lastErr})`)
      return null
    }
    if (Date.now() - lastLog >= logEvery) {
      lastLog = Date.now()
      note(`${label} poll ${((Date.now() - start) / 1000).toFixed(1)}s value=${JSON.stringify(value)} probe=${dt}ms`)
    }
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
      const src = ${probe.colorFrom === 'color' ? 'cs.color' : 'cs.backgroundColor'}
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
  elExpr: `[...document.querySelectorAll('.bg-food-primary')].find(e => e.textContent.trim().startsWith('全部'))`,
  colorFrom: 'backgroundColor',
  minCount: 1200,
}
const setViewport = (width, height, mobile = false) =>
  send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile })

const CARDS = `document.querySelectorAll('.food-card a[href^="http"]').length`

async function ensureAllCards(expectCount) {
  await evaluate(`(() => { document.documentElement.style.scrollBehavior='auto'; document.body.style.scrollBehavior='auto'; return true })()`)
  let count = 0
  const totals = []
  for (let pass = 1; pass <= 3 && count < expectCount; pass += 1) {
    await evaluate(`window.scrollTo(0, 0)`)
    await sleep(350)
    let stall = 0
    for (let i = 0; i < 700; i += 1) {
      const s = await evaluate(
        `(() => { const max = document.documentElement.scrollHeight - window.innerHeight; window.scrollBy(0, 150); return { at: window.scrollY, max } })()`,
      )
      await sleep(50)
      count = await evaluate(CARDS)
      if (count >= expectCount) break
      if (s.at >= s.max - 2) {
        stall += 1
        if (stall >= 3) break
        await sleep(800)
      } else {
        stall = 0
      }
    }
    totals.push(`pass${pass}=${count}`)
    if (count < expectCount) await sleep(1500)
  }
  await evaluate(`window.scrollTo(0, document.body.scrollHeight)`)
  await sleep(700)
  const ok = await poll(`${CARDS} >= ${expectCount}`, 8000)
  note(`lazy render: ${totals.join(' ')} · food-card nodes=${await evaluate(`document.querySelectorAll('.food-card').length`)}`)
  await evaluate(`window.scrollTo(0, 0)`)
  await sleep(500)
  return ok ? expectCount : (await evaluate(CARDS))
}

mkdir(OUT, { recursive: true }).catch(() => {})
await send('Page.enable')
await send('Runtime.enable')
await send('Network.enable').catch(() => {})
{
  const inFlight = new Map()
  ws.addEventListener('message', (event) => {
    const m = JSON.parse(String(event.data))
    if (m.method === 'Network.requestWillBeSent' && /\/api\//.test(m.params.request.url)) {
      inFlight.set(m.params.requestId, { url: m.params.request.url, t: Date.now() })
    }
    if (m.method === 'Network.loadingFinished' && inFlight.has(m.params.requestId)) {
      const r = inFlight.get(m.params.requestId)
      inFlight.delete(m.params.requestId)
      const ms = Date.now() - r.t
      if (ms > 700) notes.push(`  ·   SLOW net ${r.url.replace(BASE, '')} ${ms}ms`)
    }
    if (m.method === 'Network.loadingFailed' && inFlight.has(m.params.requestId)) {
      const r = inFlight.get(m.params.requestId)
      inFlight.delete(m.params.requestId)
      notes.push(`  ·   NET FAIL ${r.url.replace(BASE, '')} ${JSON.stringify(m.params.errorText)} after ${Date.now() - r.t}ms`)
    }
  })
}

/* 可见性护栏 */
await send('Page.bringToFront').catch(() => {})
const visibleOk = await waitFor(async () => {
  const state = await evaluate(`document.visibilityState`).catch(() => null)
  if (state !== 'visible') return false
  const tick = await evaluate(`new Promise(r => setTimeout(() => r(1), 150))`, true).catch(() => null)
  return tick === 1
}, 8000)
if (!visibleOk) {
  console.error('FATAL: 浏览器页面 hidden（被遮挡/最小化）——请让测试窗口回前台重跑')
  process.exit(1)
}
note('page visible + timers not throttled')

/* ================= P1 主站 27 站 ================= */
console.log('\n[P1] 主站 27 站')
await navigate(`${BASE}/`)
await setViewport(1280, 860)
const activeCount = await fetch(`${BASE}/api/sites?status=active`)
  .then((r) => r.json())
  .then((p) => (p.data || []).length)
  .catch(() => -1)
check('GET /api/sites?status=active = 27', activeCount === 27, String(activeCount))

const rendered = await ensureAllCards(activeCount)
check(`首页卡片渲染 == 27（${rendered}/${activeCount}）`, rendered === activeCount, `${rendered}/${activeCount}`)

const names = (await evaluate(`(() => [...document.querySelectorAll('.food-card')].map(c => (c.textContent || '').trim().slice(0, 40)))()`)) || []
check('首页含 Tinrry 甜悦家（豁免后恢复展示）', names.some((n) => n.includes('Tinrry')), JSON.stringify(names.slice(0, 6)))
check('首页含美食天下（新站 29）', names.some((n) => n.includes('美食天下')), JSON.stringify(names.slice(0, 8)))
check('首页含好豆网（新站 30）', names.some((n) => n.includes('好豆网')), JSON.stringify(names.slice(0, 8)))
check('首页不含已删真死链（甜品实验室/冰淇淋星球）',
  !names.some((n) => /甜品实验室|冰淇淋星球/.test(n)), JSON.stringify(names.filter((n) => /甜品实验室|冰淇淋星球/.test(n))))
const degraded = await evaluate(`(document.body.textContent || '').includes('数据加载失败，显示本地快照')`)
check('无降级条（数据加载失败/本地快照）', degraded === false, String(degraded))
await shot('02-home-27-sites.png', PINK_PILL)
{
  const full = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  await writeFile(`${OUT}/02-home-27-sites-full.png`, Buffer.from(full.data, 'base64'))
  note('screenshot → 02-home-27-sites-full.png（整页 27 卡片证据图）')
}

/* ================= P2 375 ================= */
console.log('\n[P2] 375 视口')
await setViewport(375, 812, true)
await sleep(700)
await ensureAllCards(activeCount)
const overflow = await evaluate(`({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, bodyW: document.body.scrollWidth })`)
check('375 无横向溢出', Boolean(overflow) && overflow.scrollW <= overflow.innerW + 1, JSON.stringify(overflow))
await shot('03-mobile-375.png', PINK_PILL)
await setViewport(1280, 860)
await sleep(400)

/* ================= P3 admin 站点表 + 豁免徽标 ================= */
console.log('\n[P3] admin · 站点表豁免徽标')
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
check('admin 登录成功', loggedIn === true, String(loggedIn))

const toSites = await evaluate(`(() => {
  const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '站点管理')
  if (!b) return false
  b.click()
  return true
})()`)
await sleep(1200)
check('进入「站点管理」', toSites === true, String(toSites))

const tableReady = await poll(
  `(document.body.textContent || '').includes('共 27 个站点') && document.querySelectorAll('tbody tr').length >= 27`,
  15000,
)
check('站点表 27 行 + 文案「共 27 个站点」', tableReady === true, String(tableReady))

const badgeInfo = await evaluate(`(() => {
  const row = [...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('Tinrry'))
  if (!row) return { err: 'row not found' }
  const badge = [...row.querySelectorAll('span')].find(s => s.textContent.trim() === '豁免')
  if (!badge) return { err: 'badge not found', rowText: row.textContent.slice(0, 120) }
  badge.scrollIntoView({ block: 'center' })
  const r = badge.getBoundingClientRect()
  return { text: badge.textContent.trim(), className: badge.className, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, rowText: row.textContent.slice(0, 160) }
})()`)
check('Tinrry 行显示「豁免」徽标', Boolean(badgeInfo) && badgeInfo.text === '豁免', JSON.stringify(badgeInfo))
note(`tinrry row: ${badgeInfo && badgeInfo.rowText}`)
await sleep(400)
await shot('01a-admin-skip-badge.png', {
  elExpr: `[...document.querySelectorAll('span')].find(s => s.textContent.trim() === '豁免')`,
  colorFrom: 'backgroundColor',
  minCount: 300,
})

/* ================= P4 编辑 tinrry → 豁免开关已回显 ================= */
console.log('\n[P4] admin · 编辑表单豁免开关')
const opened = await evaluate(`(() => {
  const row = [...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('Tinrry'))
  if (!row) return false
  const b = [...row.querySelectorAll('button')].find(x => x.textContent.trim() === '编辑')
  if (!b) return false
  b.click()
  return true
})()`)
await sleep(900)
check('打开 Tinrry 编辑表单', opened === true, String(opened))

const formInfo = await waitFor(async () => {
  const info = await evaluate(`(() => {
    const box = document.querySelector('input[aria-label="跳过自动检测"]')
    if (!box) return null
    const label = box.closest('label')
    const hint = label ? (label.textContent || '') : ''
    return { checked: box.checked, hint: hint.slice(0, 120), hasExplain: hint.includes('跳过自动检测') }
  })()`)
  return info
}, 8000)
check('表单含「跳过自动检测」开关且已勾选回显', Boolean(formInfo) && formInfo.checked === true, JSON.stringify(formInfo))
check('开关说明文案含「cron / 手动全量 / 单站检测」',
  Boolean(formInfo) && /cron/.test(formInfo.hint || '') && /单站检测/.test(formInfo.hint || ''),
  JSON.stringify(formInfo))
await evaluate(`(() => {
  const box = document.querySelector('input[aria-label="跳过自动检测"]')
  if (box) box.scrollIntoView({ block: 'center' })
  const form = box ? box.closest('form') : null
  if (form) { form.scrollTop = form.scrollHeight }
  const dlg = document.querySelector('[role="dialog"]')
  if (dlg) dlg.scrollTop = dlg.scrollHeight
  return true
})()`)
await sleep(500)
await shot('01-admin-skip-check.png', {
  elExpr: `[...document.querySelectorAll('button[type="submit"]')].find(b => (b.textContent || '').includes('保存'))`,
  colorFrom: 'backgroundColor',
  minCount: 900,
})
await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '取消')
  if (b) b.click()
  return !!b
})()`)
await sleep(700)

/* ================= P5 单站检测按钮 → 跳过提示 ================= */
console.log('\n[P5] admin · 豁免站单站检测跳过提示')
const p5Rounds = []
const p5Start = Date.now()
const checkedNotice = await waitFor(async () => {
  const hit = await evaluate(`(() => {
    const row = [...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('Tinrry'))
    if (!row) return 'no row'
    const b = [...row.querySelectorAll('button')].find(x => x.textContent.trim() === '检测')
    if (!b) return 'no check btn'
    if (b.disabled) return 'disabled'
    b.click()
    return 'clicked'
  })()`)
  p5Rounds.push(`t=${((Date.now() - p5Start) / 1000).toFixed(1)}s:${hit}`)
  if (hit !== 'clicked') return false
  const text = await waitForLogged(
    'P5-notice',
    () =>
      evaluate(
        `(() => (document.body.textContent || '').includes('已设置「跳过自动检测」，本次不参与检测'))()`,
      ),
    20000,
  )
  if (text) p5Rounds.push(`notice after ${((Date.now() - p5Start) / 1000).toFixed(1)}s`)
  return Boolean(text)
}, 60000)
check('点击豁免站「检测」→ 跳过提示文案', checkedNotice === true, p5Rounds.join(' | '))
if (!checkedNotice) {
  const diag = await evaluate(`(() => {
    const row = [...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('Tinrry'))
    return {
      dlg: !!document.querySelector('[role="dialog"]'),
      rowBtns: row ? [...row.querySelectorAll('button')].map(b => b.textContent.trim()) : null,
      hint: (document.body.textContent.match(/.{0,12}(已设置|检测完成|跳过|失败|错误).{0,36}/g) || []).slice(0, 4),
      aria: document.querySelector('input[aria-label="跳过自动检测"]')?.checked ?? null,
      vis: document.visibilityState,
    }
  })()`)
  note(`P5 diag: ${JSON.stringify(diag)}`)
}

/* ================= P6 新增站点表单默认不豁免 ================= */
console.log('\n[P6] admin · 新增表单默认关闭')
const createOpened = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('新增站点'))
  if (!b) return 'btn not found'
  b.click()
  return 'clicked'
})()`)
await sleep(800)
const p6Start = Date.now()
const createInfo = await waitForLogged(
  'P6-form',
  () =>
    evaluate(
      `(() => { const box = document.querySelector('input[aria-label="跳过自动检测"]'); return box ? { checked: box.checked } : null })()`,
    ),
  20000,
)
const p6Elapsed = ((Date.now() - p6Start) / 1000).toFixed(1)
check('新增站点表单含豁免开关且默认未勾选', createOpened === 'clicked' && Boolean(createInfo) && createInfo.checked === false, `open=${createOpened} info=${JSON.stringify(createInfo)} after=${p6Elapsed}s vis=${await evaluate('document.visibilityState')}`)
if (createInfo) note(`P6 checkbox found after ${p6Elapsed}s`)
if (!createInfo) {
  const diag = await evaluate(`(() => ({
    dlg: !!document.querySelector('[role="dialog"]'),
    aria: document.querySelector('input[aria-label="跳过自动检测"]')?.checked ?? null,
    bodyHint: (document.body.textContent.match(/新增站点|编辑站点|跳过自动检测/g) || []).slice(0, 5),
    btns: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean).slice(0, 25),
  }))()`)
  note(`P6 diag: ${JSON.stringify(diag)}`)
}
await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '取消')
  if (b) b.click()
  return !!b
})()`)
await sleep(600)

/* ================= P7 暗色 admin 徽标/表单 ================= */
console.log('\n[P7] 暗色 admin')
await navigate(`${BASE}/`)
await sleep(600)
const darkOn = await evaluate(`(() => {
  const b = document.querySelector('button[aria-label^="切换到"]')
  if (!b) return false
  b.click()
  return true
})()`)
await sleep(500)
const isDark = await evaluate(`document.documentElement.classList.contains('dark')`)
check('主站切换到暗色', darkOn === true && isDark === true, `clicked=${darkOn} dark=${isDark}`)
await navigate(`${BASE}/admin`)
await sleep(800)
await evaluate(`(() => {
  const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '站点管理')
  if (b) b.click()
  return true
})()`)
const darkTable = await poll(
  `(document.body.textContent || '').includes('共 27 个站点')`,
  15000,
)
check('暗色下进入站点管理', darkTable === true, String(darkTable))
const adminDark = await evaluate(`(() => {
  const row = [...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('Tinrry'))
  if (row) row.scrollIntoView({ block: 'center' })
  return document.documentElement.classList.contains('dark')
})()`)
await sleep(400)
check('暗色下 admin 仍渲染豁免徽标',
  adminDark === true && (await evaluate(`([...document.querySelectorAll('span')].some(s => s.textContent.trim() === '豁免'))`)),
  String(adminDark))
await shot('04-admin-dark-badge.png', {
  elExpr: `[...document.querySelectorAll('span')].find(s => s.textContent.trim() === '豁免')`,
  colorFrom: 'backgroundColor',
  minCount: 300,
})

/* 还原亮色 */
await navigate(`${BASE}/`)
await sleep(600)
const restored = await evaluate(`(() => {
  if (!document.documentElement.classList.contains('dark')) return true
  const b = document.querySelector('button[aria-label^="切换到"]')
  if (b) b.click()
  return true
})()`)
await sleep(600)
const lightBack = await evaluate(`!document.documentElement.classList.contains('dark')`)
check('还原为亮色主题', restored === true && lightBack === true, String(lightBack))

/* ================= 汇总 ================= */
const summaryLine = `RESULT: ${pass} passed / ${fail} failed`
console.log(`\n${summaryLine}`)
results.push('', summaryLine)
await writeFile(
  `${OUT}/live-checks.txt`,
  `# task-21 · 线上 CDP 验收 + 截图 · ${new Date().toISOString()}\n# ${BASE} · CDP ${CDP}\n\n${results.join('\n')}\n\n# notes\n${notes.join('\n')}\n`,
  'utf8',
)
console.log(`written: ${OUT}/live-checks.txt`)
process.exit(fail > 0 ? 1 : 0)
