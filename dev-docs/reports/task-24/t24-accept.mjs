// task-24 · 本地 CDP 手动验收（10 项清单）+ 3 张截图
// 前置：npx wrangler pages dev dist --port 8788（本地 D1 + .dev.vars）
//       Edge --remote-debugging-port=9222（独立 user-data-dir）
import { mkdir, writeFile } from "node:fs/promises"

const BASE = "http://127.0.0.1:8788"
const CDP = "http://127.0.0.1:9222"
const OUT = "E:/react/food-nav/dev-docs/reports/task-24"
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

/* ---------- CDP 连接 ---------- */
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
const pageErrors = []
ws.onmessage = (event) => {
  const msg = JSON.parse(String(event.data))
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)))
    else resolve(msg.result)
    return
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params && msg.params.exceptionDetails
    pageErrors.push((d && (d.exception ? d.exception.description || d.exception.value : d.text)) || "unknown")
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
    } catch {
      /* 导航中 evaluate 可能失败，重试 */
    }
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timeout after ${timeoutMs}ms`)
    await sleep(150)
  }
}
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
  if (r && r.exceptionDetails) throw new Error(r.exceptionDetails.text || "evaluate failed")
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

/** 读 3D 层运行态快照 */
const sakura = `(() => {
  const layer = document.querySelector('.sakura3d-layer')
  if (!layer) return null
  const hook = layer.__sakura3d
  const canvas = layer.querySelector('canvas')
  const cs = getComputedStyle(layer)
  return {
    fixed: cs.position === 'fixed',
    inset: cs.top === '0px' && cs.right === '0px' && cs.bottom === '0px' && cs.left === '0px',
    z: cs.zIndex,
    pe: cs.pointerEvents,
    hasCanvas: !!canvas,
    canvasW: canvas ? canvas.width : 0,
    canvasH: canvas ? canvas.height : 0,
    count: hook ? hook.count : -1,
    sceneChildren: hook && hook.scene ? hook.scene.children.length : -1,
    petalsLen: hook && hook.petals ? hook.petals.length : -1,
    geo: hook && hook.renderer ? hook.renderer.info.memory.geometries : -1,
    tris: hook && hook.renderer ? hook.renderer.info.render.triangles : -1,
    calls: hook && hook.renderer ? hook.renderer.info.render.calls : -1,
    frame: hook && hook.renderer ? hook.renderer.info.render.frame : -1,
    camX: hook ? hook.camera.position.x : null,
    camY: hook ? hook.camera.position.y : null,
    hidden: document.hidden,
  }
})()`

/** 3D 层就绪探测：hook + canvas + 至少跑过一帧 */
const sakuraReady = `(() => {
  const layer = document.querySelector('.sakura3d-layer')
  if (!layer || !layer.__sakura3d) return null
  const hook = layer.__sakura3d
  if (!layer.querySelector('canvas')) return null
  return hook.renderer.info.render.frame > 2 ? true : null
})()`

/** 首屏就绪（必要时 reload 重试：wrangler pages dev 偶发慢/瞬时失败 → 3D 背景静默降级） */
async function ensureSakura(tries = 3) {
  for (let i = 0; i < tries; i += 1) {
    if (i > 0) {
      await send("Page.reload")
      await waitFor(() => ev(`!!document.querySelector('.daily-fortune')`))
    }
    try {
      const ok = await waitFor(() => ev(sakuraReady), 12000)
      if (ok) return true
    } catch {
      /* 重试 */
    }
    console.log(`  ·   3D 层未就绪，重试 ${i + 1}/${tries}`)
  }
  return false
}

await send("Page.enable")
await send("Runtime.enable")
// 防 Edge 窗口被遮挡 → document.hidden=true → rAF 停摆（frame 永远 0）
await send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {})
await send("Page.setWebLifecycleState", { state: "active" }).catch(() => {})
await send("Emulation.setDeviceMetricsOverride", {
  width: 1400,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})

/* ============ 0. 清干净上一次任务残留状态 ============ */
await navigate(`${BASE}/#/`)
await ev(`localStorage.clear()`)
await send("Page.reload")
await waitFor(() => ev(`!!document.querySelector('.daily-fortune')`))
await waitFor(() => ev(`!!localStorage.getItem('food-nav:nav-cache')`))
// three 懒加载 → 等 3D 层就绪（canvas + hook + 跑过帧）
const ready = await ensureSakura()
check("0 3D 樱花层就绪（canvas + 渲染帧）", ready)
await sleep(1500)

/* ============ 清单 1：3D 花瓣飘落 + 层级容器规格 ============ */
const s1 = await ev(sakura)
const frameA = s1.frame
await sleep(600)
const s1b = await ev(sakura)
check(
  "1 3D 层就绪：fixed inset-0 z-0 pointer-events:none + canvas + 桌面 40 片",
  Boolean(s1) &&
    s1.fixed &&
    s1.inset &&
    s1.z === "0" &&
    s1.pe === "none" &&
    s1.hasCanvas &&
    s1.canvasW > 0 &&
    s1.count === 40 &&
    s1.hidden === false,
  JSON.stringify(s1),
)
check(
  "1 每帧真实绘制（scene 恰 40 瓣、tris=2×calls、calls≤2×count 双面双 pass、geo≤40 随入画增长）且动画在跑",
  Boolean(s1) &&
    s1.sceneChildren === 40 &&
    s1.petalsLen === 40 &&
    s1.calls >= 20 &&
    s1.calls <= s1.count * 2 &&
    s1.tris === s1.calls * 2 &&
    s1.geo >= 10 &&
    s1.geo <= 40 &&
    s1b.frame > frameA,
  `scene=${s1 && s1.sceneChildren} geo=${s1 && s1.geo}→${s1b && s1b.geo} tris=${s1 && s1.tris} calls=${s1 && s1.calls} frame ${frameA} → ${s1b && s1b.frame}`,
)
const desktopTris = s1.tris
// three 是否懒加载（运行时证据：按需拉取 three chunk）
const threeLoaded = await ev(
  `performance.getEntriesByType('resource').filter(e => /three\\.module/.test(e.name)).map(e => ({ name: e.name.split('/').pop(), start: Math.round(e.startTime) }))`,
)
const navStart = await ev(`Math.round(performance.getEntriesByType('navigation')[0].responseEnd)`)
check(
  "1 three 按需懒加载（运行时才拉取 three.module-*.js）",
  Array.isArray(threeLoaded) && threeLoaded.length > 0 && threeLoaded[0].start >= (navStart || 0),
  JSON.stringify({ threeLoaded, navStart }),
)
await shot("01-3d-sakura-light")

/* ============ 清单 2：鼠标视差（远近不同速 → 相机 ±0.3 lerp） ============ */
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1360, y: 120 })
await sleep(900)
const camRight = await ev(sakura)
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 40, y: 820 })
await sleep(900)
const camLeft = await ev(sakura)
check(
  "2 鼠标右上/左下 → 相机视差位移方向正确且在 ±0.3 内",
  Boolean(camRight) &&
    Boolean(camLeft) &&
    camRight.camX > 0.1 &&
    camRight.camY > 0.05 &&
    camLeft.camX < -0.1 &&
    camLeft.camY < -0.05 &&
    Math.abs(camRight.camX) <= 0.31 &&
    Math.abs(camRight.camY) <= 0.31 &&
    Math.abs(camLeft.camX) <= 0.31 &&
    Math.abs(camLeft.camY) <= 0.31,
  `right=${JSON.stringify({ x: camRight.camX, y: camRight.camY })} left=${JSON.stringify({ x: camLeft.camX, y: camLeft.camY })}`,
)
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 700, y: 450 })

/* ============ 清单 3：花瓣层不挡交互（elementFromPoint 实测） ============ */
const hits = await ev(`(() => {
  const layer = document.querySelector('.sakura3d-layer')
  const probe = (el) => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    const x = Math.round(b.left + b.width / 2)
    const y = Math.round(b.top + Math.min(b.height / 2, 40))
    const hit = document.elementFromPoint(x, y)
    return {
      x, y,
      hitTag: hit ? hit.tagName : null,
      hitClass: hit ? String(hit.className).slice(0, 60) : null,
      contains: !!(hit && el.contains(hit)),
      isLayer: hit === layer || (hit && layer && layer.contains(hit)),
    }
  }
  const card = document.querySelector('.daily-fortune')
  const link = card ? card.querySelector('a[href^="http"]') : null
  const heart = document.querySelector('button[aria-pressed]')
  const search = document.querySelector('input[type="search"]')
  const tab = document.querySelectorAll('.category-fade, [role="tab"], button')[0]
  return {
    fortune: probe(card),
    fortuneLink: probe(link),
    header: probe(document.querySelector('header')),
    heart: probe(heart),
    search: probe(search),
    askEntry: probe([...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('问问樱见'))),
    tabs: probe(tab),
    layerPE: getComputedStyle(layer).pointerEvents,
  }
})()`)
check(
  "3 elementFromPoint：签卡 / 签卡链接 / 导航头 / 收藏心 / 搜索框 / AI 入口 命中自身（花瓣层不吃命中）",
  Boolean(hits) &&
    hits.fortune &&
    hits.fortune.contains &&
    hits.fortuneLink &&
    hits.fortuneLink.hitTag === "A" &&
    hits.header &&
    hits.header.contains &&
    hits.heart &&
    hits.heart.contains &&
    hits.search &&
    hits.search.hitTag === "INPUT" &&
    hits.askEntry &&
    hits.askEntry.contains &&
    !hits.fortune.isLayer &&
    !hits.header.isLayer &&
    !hits.heart.isLayer,
  JSON.stringify(hits),
)
// 实点：收藏心可点（aria-pressed 翻转）——证明花瓣层没有吞掉点击
const heartBefore = await ev(`(() => { const h = document.querySelector('button[aria-pressed]'); return h ? h.getAttribute('aria-pressed') : null })()`)
await ev(`(() => { const h = document.querySelector('button[aria-pressed]'); h.click(); return true })()`)
await sleep(350)
const heartAfter = await ev(`(() => { const h = document.querySelector('button[aria-pressed]'); return h ? h.getAttribute('aria-pressed') : null })()`)
check(
  "3 收藏心实点可交互（aria-pressed 翻转，层不挡点击）",
  heartBefore !== null && heartAfter !== null && heartBefore !== heartAfter,
  `${heartBefore} → ${heartAfter}`,
)
// 还原（避免影响清单 9 的收藏断言）
await ev(`(() => { const h = document.querySelector('button[aria-pressed]'); h.click(); return true })()`)
await sleep(250)

/* ============ 清单 4：切后台标签页 → 动画暂停；切回恢复 ============ */
const frameH1 = (await ev(sakura)).frame
await ev(`(() => {
  Object.defineProperty(document, 'hidden', { value: true, configurable: true, writable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  return document.hidden
})()`)
await sleep(800)
const frameH2 = (await ev(sakura)).frame
await ev(`(() => {
  delete document.hidden
  document.dispatchEvent(new Event('visibilitychange'))
  return document.hidden
})()`)
await sleep(800)
const frameH3 = (await ev(sakura)).frame
check(
  "4 切后台（hidden）动画暂停、切回恢复",
  frameH2 === frameH1 && frameH3 > frameH2,
  `frame ${frameH1} → ${frameH2} → ${frameH3}`,
)

/* ============ 清单 5：移动端 375 花瓣降密度（15 片） ============ */
await send("Emulation.setDeviceMetricsOverride", {
  width: 375,
  height: 812,
  deviceScaleFactor: 2,
  mobile: true,
})
await send("Page.reload")
await waitFor(() => ev(`!!document.querySelector('.daily-fortune')`))
await ensureSakura()
await sleep(900)
const mobileFull = await ev(sakura)
check(
  "5 375px 花瓣降密度 15 片（count=15、scene=15、geo≤15、calls≤30）且无横向溢出",
  Boolean(mobileFull) &&
    mobileFull.count === 15 &&
    mobileFull.sceneChildren === 15 &&
    mobileFull.geo >= 4 &&
    mobileFull.geo <= 15 &&
    mobileFull.calls >= 8 &&
    mobileFull.calls <= 30 &&
    (await ev(`document.documentElement.scrollWidth <= window.innerWidth + 1`)) === true,
  JSON.stringify({ mobile: mobileFull && { count: mobileFull.count, scene: mobileFull.sceneChildren, geo: mobileFull.geo, calls: mobileFull.calls, tris: mobileFull.tris }, desktopTris }),
)
await send("Emulation.setDeviceMetricsOverride", {
  width: 1400,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
await send("Page.reload")
await waitFor(() => ev(`!!document.querySelector('.daily-fortune')`))
await ensureSakura()
await sleep(1200)

/* ============ 清单 6：暗色模式花瓣正常可见 ============ */
const toggleTheme = `(() => {
  const b = [...document.querySelectorAll('header button')].find(x => (x.getAttribute('aria-label')||'').includes('主题'))
  if (!b) return false
  b.click()
  return true
})()`
await ev(toggleTheme)
await waitFor(() => ev(`document.documentElement.classList.contains('dark')`))
await sleep(1500)
const darkS = await ev(sakura)
check(
  "6 暗色下 3D 层仍在运行（count=40、帧在跑）",
  Boolean(darkS) && darkS.count === 40 && darkS.hasCanvas,
  JSON.stringify(darkS),
)
const darkFrame1 = darkS.frame
await sleep(500)
const darkFrame2 = (await ev(sakura)).frame
check("6 暗色动画未停", darkFrame2 > darkFrame1, `${darkFrame1} → ${darkFrame2}`)
await shot("02-3d-sakura-dark")
await ev(toggleTheme)
await waitFor(() => ev(`!document.documentElement.classList.contains('dark')`))
await sleep(600)

/* ============ 清单 7：签卡纯静态（无摇签） + 站点直达链接 ============ */
const fortuneBefore = await ev(`(() => {
  const c = document.querySelector('.daily-fortune')
  if (!c) return null
  const link = c.querySelector('a[href^="http"]')
  return {
    text: c.textContent,
    role: c.getAttribute('role'),
    tabIndex: c.getAttribute('tabindex'),
    cursor: getComputedStyle(c).cursor,
    hasShakeClass: c.classList.contains('fortune-shake'),
    hasShakeHint: c.textContent.includes('摇一摇'),
    linkTarget: link ? link.getAttribute('target') : null,
    linkRel: link ? (link.getAttribute('rel') || '') : null,
    linkHref: link ? link.getAttribute('href') : null,
    hasCursorPointer: c.className.includes('cursor-pointer'),
    hasOnClick: !!c.onclick,
  }
})()`)
for (let i = 0; i < 3; i += 1) {
  await ev(`(() => { const c = document.querySelector('.daily-fortune'); if (c) c.click(); return true })()`)
  await sleep(150)
}
const fortuneAfter = await ev(`(() => {
  const c = document.querySelector('.daily-fortune')
  return { text: c.textContent, shake: c.classList.contains('fortune-shake') }
})()`)
check(
  "7 签卡纯静态：无 role/tabindex/cursor-pointer/onClick、点击 3 次签文不变、无摇签动画",
  Boolean(fortuneBefore) &&
    fortuneBefore.role === null &&
    fortuneBefore.tabIndex === null &&
    fortuneBefore.cursor === "auto" &&
    !fortuneBefore.hasCursorPointer &&
    !fortuneBefore.hasShakeClass &&
    !fortuneBefore.hasShakeHint &&
    !fortuneAfter.shake &&
    fortuneAfter.text === fortuneBefore.text,
  JSON.stringify({ fortuneBefore, fortuneAfter }),
)
check(
  "7 站点名直达链接保留（_blank + noopener + http）",
  Boolean(fortuneBefore) &&
    fortuneBefore.linkTarget === "_blank" &&
    (fortuneBefore.linkRel || "").includes("noopener") &&
    /^https?:/.test(fortuneBefore.linkHref || ""),
  JSON.stringify(fortuneBefore),
)
// 签卡文本命中模板池
check(
  "7 签文命中每日推荐模板池",
  Boolean(fortuneBefore) && /今日宜吃|今天来点|饿了的话|今日签/.test(fortuneBefore.text),
  fortuneBefore && fortuneBefore.text,
)

/* ============ 清单 8：SakuraBurst 2D 点击溅花瓣仍在 ============ */
await ev(`document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 700, clientY: 460 }))`)
await sleep(180)
const burst = await ev(`(() => {
  const l = document.querySelector('.sakura-layer')
  if (!l) return null
  return {
    petals: l.querySelectorAll('.sakura-petal').length,
    pe: getComputedStyle(l).pointerEvents,
    z: getComputedStyle(l).zIndex,
  }
})()`)
check(
  "8 SakuraBurst 点击溅花瓣仍在（≥3 片、pointer-events:none、z 高于 3D 层）",
  Boolean(burst) && burst.petals >= 3 && burst.pe === "none" && Number(burst.z) > 0,
  JSON.stringify(burst),
)
await sleep(1300)

/* ============ 清单 9：主站收藏/主题/搜索/音乐 + AI 页无回归 ============ */
const favOn = await ev(`(() => { const h = document.querySelector('button[aria-pressed]'); const before = h.getAttribute('aria-pressed'); h.click(); return before })()`)
await sleep(300)
const favOff = await ev(`(() => { const h = document.querySelector('button[aria-pressed]'); return h ? h.getAttribute('aria-pressed') : null })()`)
check("9 收藏 toggle 正常", favOn !== null && favOff !== null && favOn !== favOff, `${favOn} → ${favOff}`)

const themeOk = await ev(toggleTheme)
await sleep(400)
const themeOn = await ev(`document.documentElement.classList.contains('dark')`)
check("9 主题切换正常", themeOk && themeOn, JSON.stringify({ themeOk, themeOn }))
await ev(toggleTheme)
await sleep(300)

const searchRes = await ev(`(() => {
  const input = document.querySelector('input[type="search"]')
  const total = document.querySelectorAll('.food-card').length
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, '咖啡')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return { total }
})()`)
await sleep(450)
const afterSearch = await ev(`document.querySelectorAll('.food-card').length`)
check(
  "9 搜索过滤正常",
  searchRes && afterSearch > 0 && afterSearch < searchRes.total,
  JSON.stringify({ total: searchRes && searchRes.total, afterSearch }),
)
await ev(`(() => {
  const input = document.querySelector('input[type="search"]')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, '')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)
await sleep(300)

const musicOpen = await ev(`(() => { const b = document.querySelector('button[aria-label="展开音乐播放器"]'); if (!b) return false; b.click(); return true })()`)
await sleep(450)
const musicPanel = await ev(`!!document.querySelector('[aria-label="音乐播放器面板"]')`)
check("9 音乐播放器展开正常", musicOpen && musicPanel, JSON.stringify({ musicOpen, musicPanel }))
await ev(`(() => { const c = document.querySelector('button[aria-label="收起音乐播放器"]'); if (c) c.click(); return true })()`)
await sleep(250)

// AI 页：路由可达 + 花瓣层不盖在 ask UI 之上（视觉证据 03 截图）
await navigate(`${BASE}/#/ask`)
await waitFor(() => ev(`!!document.querySelector('textarea')`))
await sleep(1500)
const askState = await ev(`(() => {
  const layer = document.querySelector('.sakura3d-layer')
  const input = document.querySelector('textarea')
  const b = input.getBoundingClientRect()
  const hit = document.elementFromPoint(Math.round(b.left + b.width/2), Math.round(b.top + b.height/2))
  const s = layer && layer.__sakura3d
  return {
    layerPE: layer ? getComputedStyle(layer).pointerEvents : null,
    layerZ: layer ? getComputedStyle(layer).zIndex : null,
    hitIsInput: hit === input || (hit && input.contains(hit)),
    askBg: getComputedStyle(document.querySelector('.ask-page')).backgroundImage.slice(0, 40),
    count: s ? s.count : -1,
  }
})()`)
check(
  "9 AI 页可达 + 输入框 elementFromPoint 命中自身（花瓣层不挡交互）",
  Boolean(askState) && askState.hitIsInput && askState.layerPE === "none" && askState.count === 40,
  JSON.stringify(askState),
)
await shot("03-ask-no-overlap")

/* ============ 清单 10：reduced-motion 用户 → 无花瓣动画 ============ */
await send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
})
await navigate(`${BASE}/#/`)
await send("Page.reload")
await waitFor(() => ev(`!!document.querySelector('.daily-fortune')`))
await sleep(2500)
const reduced = await ev(`(() => ({
  layer: !!document.querySelector('.sakura3d-layer'),
  canvas: document.querySelectorAll('.sakura3d-layer canvas').length,
  burst: document.querySelectorAll('.sakura-layer').length,
  fortune: !!document.querySelector('.daily-fortune'),
}))()`)
check(
  "10 reduced-motion：无 3D 花瓣层（组件 return null），签卡仍正常",
  Boolean(reduced) && !reduced.layer && reduced.canvas === 0 && reduced.fortune,
  JSON.stringify(reduced),
)
await send("Emulation.setEmulatedMedia", { features: [] })
await send("Page.reload")
await waitFor(() => ev(`!!document.querySelector('.daily-fortune')`))
await ensureSakura()
await sleep(800)

/* ============ 页面异常 ============ */
check("无未捕获页面异常", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | ").slice(0, 500))

let summary = `RESULT: ${pass} passed / ${fail} failed\n${results.join("\n")}\n`
if (pageErrors.length) summary += `\npageErrors:\n${pageErrors.join("\n")}\n`
await writeFile(`${OUT}/accept-log.txt`, summary)
console.log(summary.trim())
ws.close()
process.exit(fail === 0 ? 0 : 1)
