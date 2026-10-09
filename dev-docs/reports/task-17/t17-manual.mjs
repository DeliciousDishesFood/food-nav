// task-17 补充 · 手动清单里脚本未覆盖项（搜索 / 分类记忆 / 打字机 / 音乐播放器 / /api 不种 cookie）
// 输出：dev-docs/reports/task-17/manual-checks.txt
const BASE = 'https://food-nav.shiora.cc'
const CDP = 'http://127.0.0.1:9222'
const OUT = 'E:/react/food-nav/dev-docs/reports/task-17/manual-checks.txt'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  const line = cond ? `  ok  ${name}` : `  FAIL ${name}${extra ? ` -> ${extra}` : ''}`
  if (cond) pass += 1
  else fail += 1
  results.push(line)
  console.log(line)
}
const note = (text) => {
  results.push(`  ·   ${text}`)
  console.log(`  ·   ${text}`)
}

const targets = await (await fetch(`${CDP}/json/list`)).json()
const target = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'))
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
    if (msg.error) reject(new Error(msg.error.message))
    else resolve(msg.result)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    msgId += 1
    pending.set(msgId, { resolve, reject })
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
const evaluate = async (expression, awaitPromise = false) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails.text))
  return res.result ? res.result.value : undefined
}
const waitFor = async (probe, timeoutMs = 8000) => {
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
const navigate = async (url) => {
  await send('Page.navigate', { url })
  await waitFor(async () => {
    const s = await evaluate(`({ href: location.href, ready: document.readyState })`)
    return s && s.href.startsWith(url) && s.ready === 'complete'
  }, 25000)
  await sleep(600)
}

await send('Page.enable')
await send('Network.enable')
await send('Runtime.enable')

/* 可见性护栏（同 t17-live.mjs：hidden 页面会被 Chromium 节流 IO/定时器） */
await send('Page.bringToFront').catch(() => {})
const visibleOk = await waitFor(async () => {
  const state = await evaluate(`document.visibilityState`).catch(() => null)
  if (state !== 'visible') return false
  const tick = await evaluate(`new Promise(r => setTimeout(() => r(1), 150))`, true).catch(() => null)
  return tick === 1
}, 8000)
if (!visibleOk) {
  console.error('FATAL: 浏览器页面 hidden（窗口被遮挡/最小化）—— 请让测试窗口回到前台后重跑')
  process.exit(1)
}

console.log('[M1] 手动清单补测（线上）')

/* --- 1. middleware：/api 响应不种 cookie --- */
{
  const health = await fetch(`${BASE}/api/health`)
  const sites = await fetch(`${BASE}/api/sites?status=active`)
  const setCookies = [health.headers.get('set-cookie'), sites.headers.get('set-cookie')].filter(Boolean)
  check('middleware: /api 响应不种 Set-Cookie', setCookies.length === 0, JSON.stringify(setCookies))
}

await navigate(`${BASE}/`)
await evaluate(`(() => { localStorage.clear(); return true })()`)
await navigate(`${BASE}/`)

const cardTotal = () => evaluate(`document.querySelectorAll('.food-card').length`)
const groupCount = () => evaluate(`document.querySelectorAll('.category-fade > section').length`)
const activeTab = () =>
  evaluate(`(() => {
    const t = [...document.querySelectorAll('main .no-scrollbar button')].find(b => b.className.includes('bg-food-primary'))
    return t ? t.textContent.trim() : null
  })()`)

await waitFor(async () => (await groupCount()) >= 1, 20000)
note(`tabs=${JSON.stringify(await evaluate(`[...document.querySelectorAll('main .no-scrollbar button')].map(b => b.textContent.trim())`))}`)
note(`初始：groups=${await groupCount()} cards=${await cardTotal()} active=${await activeTab()}`)

/* --- 2. 搜索过滤 --- */
{
  await evaluate(`(() => {
    const el = document.querySelector('input[type="search"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, '烘焙')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await sleep(700)
  const pill = await evaluate(`(() => {
    const el = [...document.querySelectorAll('main div')].find(d => /找到\\s*\\d+\\s*个美味结果/.test(d.textContent||'') && d.children.length <= 6)
    return el ? el.textContent.replace(/\\s+/g,' ').trim() : null
  })()`)
  const filtered = await cardTotal()
  note(`搜索"烘焙"：${pill} · cards=${filtered}`)
  check('搜索过滤：出现「找到 N 个美味结果」且卡片数收敛', Boolean(pill) && filtered > 0 && filtered < 22, JSON.stringify({ pill, filtered }))

  await evaluate(`(() => { const b = document.querySelector('button[aria-label="清空搜索"]'); if (b) b.click(); return !!b })()`)
  await sleep(700)
  const backCards = await cardTotal()
  const pillGone = await evaluate(`!(document.body.textContent||'').includes('个美味结果')`)
  check('清空搜索后恢复全部卡片', backCards === 22 && pillGone, JSON.stringify({ backCards, pillGone }))
}

/* --- 3. 分类切换 + 记忆（刷新保持） --- */
{
  const clicked = await evaluate(`(() => {
    const t = [...document.querySelectorAll('main .no-scrollbar button')].find(b => b.textContent.trim() === '茶饮咖啡')
    if (t) t.click()
    return t ? t.textContent.trim() : null
  })()`)
  await sleep(800)
  const stored = await evaluate(`localStorage.getItem('food-nav:category')`)
  const groups1 = await groupCount()
  const cards1 = await cardTotal()
  note(`切到 ${clicked}：groups=${groups1} cards=${cards1} stored=${stored}`)
  check('分类切换即筛选（单分类、卡片数=该分类数）', clicked === '茶饮咖啡' && groups1 === 1 && cards1 === 7, JSON.stringify({ clicked, groups1, cards1 }))

  await navigate(`${BASE}/`)
  await waitFor(async () => (await groupCount()) >= 1, 20000)
  const activeAfter = await activeTab()
  const groups2 = await groupCount()
  const stored2 = await evaluate(`localStorage.getItem('food-nav:category')`)
  note(`刷新后：active=${activeAfter} groups=${groups2} stored=${stored2}`)
  check('分类记忆：刷新后仍停留在上次分类', activeAfter === '茶饮咖啡' && groups2 === 1 && String(stored2) === String(stored), JSON.stringify({ activeAfter, groups2, stored2 }))

  await evaluate(`(() => {
    const t = [...document.querySelectorAll('main .no-scrollbar button')].find(b => b.textContent.trim() === '全部')
    if (t) t.click()
    return !!t
  })()`)
  await sleep(800)
  const groups3 = await groupCount()
  const stored3 = await evaluate(`localStorage.getItem('food-nav:category')`)
  check('切回「全部」恢复 5 分类', groups3 === 5 && stored3 === 'all', JSON.stringify({ groups3, stored3 }))
}

/* --- 4. 打字机暖心句 --- */
{
  const readQuote = () =>
    evaluate(`(() => { const p = document.querySelector('header p[aria-live="off"]'); return p ? p.textContent.trim() : '' })()`)
  const q1 = await readQuote()
  await sleep(1500)
  const q2 = await readQuote()
  note(`打字机 sample1="${q1.slice(0, 30)}" sample2="${q2.slice(0, 30)}"`)
  check('打字机暖心句渲染（两次采样均有内容）', q1.length > 0 && q2.length > 0, JSON.stringify({ q1, q2 }))
}

/* --- 5. 音乐播放器 --- */
{
  const opened = await evaluate(`(() => { const b = document.querySelector('button[aria-label="展开音乐播放器"]'); if (b) b.click(); return !!b })()`)
  await sleep(900)
  const panel = await evaluate(`(() => {
    const p = document.querySelector('[aria-label="音乐播放器面板"]')
    if (!p) return null
    const labels = [...p.querySelectorAll('button[aria-label]')].map(b => b.getAttribute('aria-label'))
    return { labels: labels.slice(0, 8), hasProgress: !!p.querySelector('input[type="range"]') }
  })()`)
  note(`播放器面板：${JSON.stringify(panel)}`)
  check('音乐播放器可展开且含 播放/上一首/下一首/进度条', Boolean(opened) && Boolean(panel) && panel.hasProgress && ['播放', '上一首', '下一首'].every((l) => panel.labels.some((x) => x && x.includes(l))), JSON.stringify(panel))

  const closed = await evaluate(`(() => {
    const b = document.querySelector('button[aria-label="收起音乐播放器"]')
    if (b) { b.click(); return true }
    return false
  })()`)
  await sleep(600)
  const gone = await evaluate(`!document.querySelector('[aria-label="音乐播放器面板"]')`)
  check('音乐播放器可收起', closed === true && gone === true, JSON.stringify({ closed, gone }))
  await evaluate(`(() => { localStorage.removeItem('food-nav:music'); localStorage.removeItem('food-nav:volume'); return true })()`)
}

const line = `\nRESULT: ${pass} passed / ${fail} failed\n`
console.log(line)
results.push('', line.trim())
const { writeFile } = await import('node:fs/promises')
await writeFile(
  OUT,
  `# task-17 手动清单补测（线上 ${BASE}）· ${new Date().toISOString()}\n# 覆盖：/api 不种 cookie · 搜索 · 分类记忆 · 打字机 · 音乐播放器\n\n${results.join('\n')}`,
  'utf8',
)
console.log(`written → ${OUT}`)
ws.close()
process.exit(fail > 0 ? 1 : 0)
