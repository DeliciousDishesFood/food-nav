// task-22 · 本地 CDP 截图（封面兜底对比 / 404 信封 / 375）
import { mkdir, writeFile } from "node:fs/promises"

const BASE = "http://127.0.0.1:8788"
const CDP = "http://127.0.0.1:9222"
const OUT = "E:/react/food-nav/dev-docs/reports/task-22"
await mkdir(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
let pass = 0
let fail = 0
function check(name, cond, extra = "") {
  const line = cond ? `  ok  ${name}` : `  FAIL ${name}${extra ? ` -> ${extra}` : ""}`
  if (cond) pass += 1
  else fail += 1
  results.push(line)
  console.log(line)
}

let targets = await (await fetch(`${CDP}/json/list`)).json()
let target =
  targets.find((t) => t.type === "page" && t.url.startsWith(BASE)) ||
  targets.find((t) => t.type === "page" && !t.url.startsWith("devtools://") && !t.url.startsWith("edge://"))
if (!target) {
  target = await (await fetch(`${CDP}/json/new?${encodeURIComponent(BASE + "/")}`, { method: "PUT" })).json()
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
const waitFor = async (probe, timeoutMs = 15000) => {
  const start = Date.now()
  for (;;) {
    try {
      const v = await probe()
      if (v) return v
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timeout")
    await sleep(200)
  }
}
const evalAsync = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
  return r && r.result ? r.result.value : undefined
}
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png" })
  await writeFile(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"))
  console.log(`  ·   screenshot ${name}.png`)
}
const navigate = async (url) => {
  await send("Page.navigate", { url })
  await sleep(1200)
}

await send("Page.enable")
await send("Runtime.enable")
await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })

await navigate(`${BASE}/#/`)
await waitFor(async () => (await evalAsync(`document.querySelectorAll('.food-card').length`)) >= 10)
// 等 img error 或 placeholder 出现
await waitFor(async () => {
  const state = await evalAsync(`(() => {
    const c = document.querySelector('.food-card')
    if (!c) return null
    return {
      hasImg: !!c.querySelector('img[alt$="预览图"]'),
      hasPlaceholder: !!c.querySelector('svg[aria-label="美食预览占位插画"]'),
    }
  })()`)
  return state && (!state.hasImg || state.hasPlaceholder)
}, 20000)
const fallbackState = await evalAsync(`(() => {
  const cards = [...document.querySelectorAll('.food-card')]
  const c1 = cards[0]
  if (!c1) return { ok: false }
  return {
    ok: true,
    name: (c1.querySelector('span.truncate') || {}).textContent || '',
    hasImg: !!c1.querySelector('img[alt$="预览图"]'),
    hasPlaceholder: !!c1.querySelector('svg[aria-label="美食预览占位插画"]'),
  }
})()`)
check(
  "broken cover → CoverPlaceholder (no broken img)",
  fallbackState.ok && !fallbackState.hasImg && fallbackState.hasPlaceholder,
  JSON.stringify(fallbackState),
)
await shot("01-cover-fallback-broken")

// 404 信封
await navigate(`${BASE}/api/abc`)
await sleep(400)
const body404 = await evalAsync(`document.body.innerText`)
check(
  "/api/abc 404 envelope",
  body404.includes('"code":"not_found"') && body404.includes('"ok":false'),
  body404.slice(0, 120),
)
await shot("02-api-404-envelope")

// 375 封面兜底态
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })
await navigate(`${BASE}/#/`)
await waitFor(async () => (await evalAsync(`document.querySelectorAll('.food-card').length`)) >= 10)
const overflow = await evalAsync(`document.documentElement.scrollWidth <= window.innerWidth + 1`)
check("375 no horizontal overflow", overflow)
await shot("03-mobile-375-cover-fallback")
await send("Emulation.clearDeviceMetricsOverride")

const summary = `RESULT: ${pass} passed / ${fail} failed\n${results.join("\n")}\n`
await writeFile(`${OUT}/shot-log.txt`, summary)
console.log(summary.trim())
ws.close()
process.exit(fail === 0 ? 0 : 1)
