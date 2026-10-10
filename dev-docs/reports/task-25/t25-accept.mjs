// task-25 · 本地 CDP 手动验收（10 项清单）+ 3 张截图
// 前置：npx wrangler pages dev dist --port 8788（本地 D1 + .dev.vars）
//       Edge --remote-debugging-port=9222（独立 user-data-dir）
import { mkdir, writeFile, access } from "node:fs/promises"

const BASE = "http://127.0.0.1:8788"
const CDP = "http://127.0.0.1:9222"
const ROOT = "E:/react/food-nav"
const OUT = `${ROOT}/dev-docs/reports/task-25`
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
  // reload/改视口后浏览器可能恢复滚动位 → 截图前归零，保证拍到首屏装饰层
  await ev(`(() => { if (window.scrollY > 0) window.scrollTo(0, 0); return window.scrollY })()`).catch(() => {})
  await sleep(150)
  const r = await send("Page.captureScreenshot", { format: "png" })
  await writeFile(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"))
  console.log(`  ·   screenshot ${name}.png`)
}
const navigate = async (url) => {
  await send("Page.navigate", { url })
  await sleep(1200)
}
const homeReady = `!!document.querySelector('header')`

/** 读 3D 层运行态快照（花瓣 + 月亮 + 树） */
const sakura = `(() => {
  const layer = document.querySelector('.sakura3d-layer')
  if (!layer) return null
  const hook = layer.__sakura3d
  const canvas = layer.querySelector('canvas')
  const cs = getComputedStyle(layer)
  const proj = (obj) => {
    const v = obj.position.clone().project(hook.camera)
    return { x: Number(v.x.toFixed(3)), y: Number(v.y.toFixed(3)), z: Number(v.z.toFixed(3)) }
  }
  const decor = (() => {
    if (!hook || !hook.moon || !hook.tree) return null
    const moonMesh = hook.moon.children[0]
    const glow = hook.moon.children[1]
    return {
      moon: {
        x: Number(hook.moon.position.x.toFixed(3)),
        y: Number(hook.moon.position.y.toFixed(3)),
        z: Number(hook.moon.position.z.toFixed(3)),
        ndc: proj(hook.moon),
        children: hook.moon.children.length,
        scale: Number(hook.moon.scale.x.toFixed(3)),
        hasMap: !!(moonMesh && moonMesh.material && moonMesh.material.map),
        geoType: moonMesh ? moonMesh.geometry.type : null,
        glowOpacity: glow ? Number(glow.material.opacity.toFixed(3)) : null,
        glowTransparent: glow ? !!glow.material.transparent : false,
        glowBackSide: glow ? glow.material.side === 1 : false,
        glowGeoType: glow ? glow.geometry.type : null,
        glowRadius: glow ? glow.geometry.parameters.radius : null,
        moonRadius: moonMesh ? moonMesh.geometry.parameters.radius : null,
      },
      tree: {
        x: Number(hook.tree.position.x.toFixed(3)),
        y: Number(hook.tree.position.y.toFixed(3)),
        z: Number(hook.tree.position.z.toFixed(3)),
        ndc: proj(hook.tree),
        children: hook.tree.children.length,
        scale: Number(hook.tree.scale.x.toFixed(3)),
        types: hook.tree.children.map((c) => c.geometry.type),
        crownFlat: hook.tree.children
          .filter((c) => c.geometry.type === "IcosahedronGeometry")
          .every((c) => c.geometry.index === null),
        icoCount: hook.tree.children.filter((c) => c.geometry.type === 'IcosahedronGeometry').length,
        crownColors: hook.tree.children
          .filter((c) => c.geometry.type === 'IcosahedronGeometry')
          .map((c) => '#' + c.material.color.getHexString()),
      },
    }
  })()
  const petal0 = hook && hook.petals && hook.petals[0]
  return {
    fixed: cs.position === 'fixed',
    inset: cs.top === '0px' && cs.right === '0px' && cs.bottom === '0px' && cs.left === '0px',
    z: cs.zIndex,
    pe: cs.pointerEvents,
    hasCanvas: !!canvas,
    canvasW: canvas ? canvas.width : 0,
    count: hook ? hook.count : -1,
    sceneChildren: hook && hook.scene ? hook.scene.children.length : -1,
    petalsLen: hook && hook.petals ? hook.petals.length : -1,
    crossVerts: petal0 ? petal0.mesh.geometry.attributes.position.count : -1,
    crossIdx: petal0 ? petal0.mesh.geometry.index.count : -1,
    petalOpacity: petal0 ? petal0.mesh.material.opacity : null,
    petalDoubleSide: petal0 ? petal0.mesh.material.side === 2 : false,
    geo: hook && hook.renderer ? hook.renderer.info.memory.geometries : -1,
    tris: hook && hook.renderer ? hook.renderer.info.render.triangles : -1,
    calls: hook && hook.renderer ? hook.renderer.info.render.calls : -1,
    frame: hook && hook.renderer ? hook.renderer.info.render.frame : -1,
    camX: hook ? Number(hook.camera.position.x.toFixed(3)) : null,
    camY: hook ? Number(hook.camera.position.y.toFixed(3)) : null,
    decor,
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
      await waitFor(() => ev(homeReady))
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

/* ============ 0. 清残留状态 + 3D 层就绪 ============ */
await navigate(`${BASE}/#/`)
await ev(`localStorage.clear()`)
await send("Page.reload")
await waitFor(() => ev(homeReady))
await waitFor(() => ev(`!!localStorage.getItem('food-nav:nav-cache')`))
const ready = await ensureSakura()
check("0 3D 樱花装饰层就绪（canvas + 渲染帧）", ready)
await sleep(1500)

/* ============ 清单 5（先查静态删干净）：签卡整组件删除 ============ */
const gone = await ev(`(() => ({
  fortuneEl: !!document.querySelector('.daily-fortune'),
  fortuneText: /今日宜吃|摇一摇|今日签/.test(document.body.textContent),
  heroClean: !document.querySelector('.daily-fortune'),
}))()`)
let dirGone = true
try {
  await access(`${ROOT}/src/components/DailyFortune`)
  dirGone = false
} catch {
  dirGone = true
}
const homeSource = await (
  await import("node:fs/promises")
).readFile(`${ROOT}/src/pages/HomePage.jsx`, "utf8")
const verifySource = await (await import("node:fs/promises")).readFile(`${ROOT}/tests/verify.mjs`, "utf8")
// verify 检查断言名已删（文件里保留的 task-25 注释仍会提到 .daily-fortune，故按断言名匹配）
const verifyAssertGone = !/home shows daily fortune card/.test(verifySource)
check(
  "5 签卡已删：DOM 无 .daily-fortune/无签文残留 + 目录整删 + HomePage 无挂载 + verify 断言已删",
  Boolean(gone) &&
    !gone.fortuneEl &&
    !gone.fortuneText &&
    dirGone &&
    !/DailyFortune/.test(homeSource) &&
    verifyAssertGone,
  JSON.stringify({ gone, dirGone, home: /DailyFortune/.test(homeSource), verifyAssertGone }),
)

/* ============ 清单 1：粉月亮（右上） ============ */
const s1 = await ev(sakura)
const frameA = s1.frame
await sleep(600)
const s1b = await ev(sakura)
const moon = s1.decor && s1.decor.moon
check(
  "1 月亮：球体 + 径向渐变贴图 + BackSide 半透明 glow + 位置右上 + 视野内",
  Boolean(moon) &&
    moon.geoType === "SphereGeometry" &&
    moon.moonRadius === 0.8 &&
    moon.hasMap &&
    moon.children === 2 &&
    moon.glowGeoType === "SphereGeometry" &&
    moon.glowRadius > 0.8 &&
    moon.glowTransparent &&
    moon.glowBackSide &&
    moon.glowOpacity >= 0.12 &&
    moon.glowOpacity <= 0.18 &&
    moon.x > 0 &&
    moon.y > 0 &&
    Math.abs(moon.ndc.x) < 0.98 &&
    Math.abs(moon.ndc.y) < 0.98,
  JSON.stringify(moon),
)
check(
  "1 3D 层规格（fixed/inset-0/z-0/pe:none + 40 瓣 + 42 scene 子级 + 动画在跑）",
  Boolean(s1) &&
    s1.fixed &&
    s1.inset &&
    s1.z === "0" &&
    s1.pe === "none" &&
    s1.hasCanvas &&
    s1.count === 40 &&
    s1.petalsLen === 40 &&
    s1.sceneChildren === 42 &&
    s1.geo >= 10 &&
    s1.geo <= 48 &&
    s1.calls >= 20 &&
    s1.calls <= s1.count * 2 + 7 &&
    s1.tris >= s1.calls * 2 &&
    s1.hidden === false &&
    s1b.frame > frameA,
  JSON.stringify({ count: s1 && s1.count, scene: s1 && s1.sceneChildren, geo: s1 && s1.geo, calls: s1 && s1.calls, tris: s1 && s1.tris, frame: [frameA, s1b && s1b.frame] }),
)
const threeLoaded = await ev(
  `performance.getEntriesByType('resource').filter(e => /three\\.module/.test(e.name)).map(e => ({ name: e.name.split('/').pop(), start: Math.round(e.startTime) }))`,
)
const navStart = await ev(`Math.round(performance.getEntriesByType('navigation')[0].responseEnd)`)
check(
  "1 three 按需懒加载（运行时才拉取 three.module-*.js）",
  Array.isArray(threeLoaded) && threeLoaded.length > 0 && threeLoaded[0].start >= (navStart || 0),
  JSON.stringify({ threeLoaded, navStart }),
)
await shot("01-moon-tree-light")

/* ============ 清单 2：低多边形樱花树（右下） ============ */
const tree = s1.decor && s1.decor.tree
check(
  "2 树：树干 Cylinder + 4 团 Icosahedron 棱面（非索引面法线） + 粉白配色 + 位置右下 + 视野内",
  Boolean(tree) &&
    tree.children === 5 &&
    tree.types[0] === "CylinderGeometry" &&
    tree.icoCount === 4 &&
    tree.crownFlat &&
    tree.x > 0 &&
    tree.y < 0 &&
    Math.abs(tree.ndc.x) < 0.98 &&
    Math.abs(tree.ndc.y) < 0.98 &&
    tree.crownColors.every((c) => ["#ffd9e6", "#ffe2ec", "#ffe6f0", "#fff0f5"].includes(c)),
  JSON.stringify(tree),
)

/* ============ 清单 3：花瓣立体交叉 + recycle 偏树 ============ */
check(
  "3 立体花瓣：单片 = 两片 plane 交叉（8 顶点 / 12 索引）+ 粉白半透明 DoubleSide",
  Boolean(s1) && s1.crossVerts === 8 && s1.crossIdx === 12 && s1.petalOpacity === 0.65 && s1.petalDoubleSide,
  JSON.stringify({ v: s1 && s1.crossVerts, i: s1 && s1.crossIdx, o: s1 && s1.petalOpacity, side: s1 && s1.petalDoubleSide }),
)
// recycle 偏树：把下落速度调快 → 全部回收重生 → 断言新 baseX 落在树 x 附近
const baseXBefore = await ev(
  `(() => { const h = document.querySelector('.sakura3d-layer').__sakura3d; return h.petals.map(p => p.baseX) })()`,
)
await ev(`(() => { const h = document.querySelector('.sakura3d-layer').__sakura3d; h.petals.forEach(p => { p.fall = 9 }); return true })()`)
await sleep(2600)
const afterRecycle = await ev(`(() => {
  const h = document.querySelector('.sakura3d-layer').__sakura3d
  const treeX = h.tree.position.x
  return {
    treeX: Number(treeX.toFixed(3)),
    baseX: h.petals.map((p) => Number(p.baseX.toFixed(3))),
    y: h.petals.map((p) => Number(p.mesh.position.y.toFixed(2))),
  }
})()`)
const changed = afterRecycle.baseX
  .map((v, i) => ({ v, before: baseXBefore[i], moved: Math.abs(v - baseXBefore[i]) > 1e-6 }))
  .filter((r) => r.moved)
check(
  "3 recycle 起点偏树 x（重生花瓣 |x - 树x| ≤ 3.05 且至少 10 片已重生）",
  changed.length >= 10 &&
    afterRecycle.baseX.every((v) => Math.abs(v - afterRecycle.treeX) <= 3.05),
  JSON.stringify({ changed: changed.length, treeX: afterRecycle.treeX, sample: afterRecycle.baseX.slice(0, 8) }),
)

/* ============ 清单 4：视差分层（花瓣 > 月亮 > 树） ============ */
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1360, y: 120 })
await sleep(900)
const right = await ev(sakura)
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 40, y: 820 })
await sleep(900)
const left = await ev(sakura)
const dCam = Math.abs(right.camX - left.camX)
const dMoon = Math.abs(right.decor.moon.x - left.decor.moon.x)
const dTree = Math.abs(right.decor.tree.x - left.decor.tree.x)
const dCamY = Math.abs(right.camY - left.camY)
const dMoonY = Math.abs(right.decor.moon.y - left.decor.moon.y)
const dTreeY = Math.abs(right.decor.tree.y - left.decor.tree.y)
check(
  "4 视差分层：Δ相机 > Δ月亮 > Δ树 > 0（X/Y 双向，月亮 0.5×、树 0.3×）",
  dCam > dMoon &&
    dMoon > dTree &&
    dTree > 0.05 &&
    dCamY > dMoonY &&
    dMoonY > dTreeY &&
    dTreeY > 0.03 &&
    Math.abs(right.camX) <= 0.31,
  JSON.stringify({ dCam, dMoon, dTree, dCamY, dMoonY, dTreeY }),
)
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 700, y: 450 })
await sleep(400)

/* ============ 清单 6：装饰层不挡交互（elementFromPoint 实测） ============ */
const hits = await ev(`(() => {
  // reload 后浏览器可能恢复滚动位置 → 先归零，否则卡片/入口会落在视口外
  if (window.scrollY > 0) window.scrollTo(0, 0)
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
      // 命中元素可能是探针元素的自身/后代（如卡片里的图片），也可能是其祖先（如卡片根 div 包住收藏心）
      within: !!(hit && (el.contains(hit) || hit.contains(el))),
      onScreen: b.top >= 0 && b.bottom <= window.innerHeight + 1,
      isLayer: hit === layer || (hit && layer && layer.contains(hit)),
    }
  }
  const card = document.querySelector('.food-card')
  const heart = document.querySelector('button[aria-pressed]')
  const search = document.querySelector('input[type="search"]')
  return {
    card: probe(card),
    header: probe(document.querySelector('header')),
    heart: probe(heart),
    search: probe(search),
    askEntry: probe([...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('问问樱见'))),
    scrollY: window.scrollY,
    layerPE: getComputedStyle(layer).pointerEvents,
    layerZ: getComputedStyle(layer).zIndex,
  }
})()`)
check(
  "6 elementFromPoint：首卡 / 导航头 / 收藏心 / 搜索框 / AI 入口 命中自身（装饰层不吃命中）",
  Boolean(hits) &&
    hits.scrollY === 0 &&
    hits.card &&
    hits.card.within &&
    hits.header &&
    hits.header.within &&
    hits.heart &&
    hits.heart.within &&
    hits.search &&
    hits.search.hitTag === "INPUT" &&
    hits.askEntry &&
    hits.askEntry.within &&
    hits.askEntry.onScreen &&
    !hits.card.isLayer &&
    !hits.header.isLayer &&
    !hits.heart.isLayer &&
    !hits.search.isLayer &&
    !hits.askEntry.isLayer &&
    hits.layerPE === "none" &&
    hits.layerZ === "0",
  JSON.stringify(hits),
)
const heartBefore = await ev(`(() => { const h = document.querySelector('button[aria-pressed]'); return h ? h.getAttribute('aria-pressed') : null })()`)
await ev(`(() => { const h = document.querySelector('button[aria-pressed]'); h.click(); return true })()`)
await sleep(350)
const heartAfter = await ev(`(() => { const h = document.querySelector('button[aria-pressed]'); return h ? h.getAttribute('aria-pressed') : null })()`)
check("6 收藏心实点可交互（aria-pressed 翻转，层不挡点击）", heartBefore !== null && heartAfter !== null && heartBefore !== heartAfter, `${heartBefore} → ${heartAfter}`)
await ev(`(() => { const h = document.querySelector('button[aria-pressed]'); h.click(); return true })()`)
await sleep(250)

/* ============ 清单 7：暗色模式 ============ */
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
  "7 暗色：月亮/树/花瓣仍在运行（count=40、decor 在、帧在跑）",
  Boolean(darkS) && darkS.count === 40 && darkS.hasCanvas && !!darkS.decor && darkS.decor.moon.hasMap && darkS.decor.tree.children === 5,
  JSON.stringify(darkS && { count: darkS.count, moon: darkS.decor.moon.ndc, tree: darkS.decor.tree.ndc }),
)
const darkFrame1 = darkS.frame
await sleep(500)
const darkFrame2 = (await ev(sakura)).frame
check("7 暗色动画未停", darkFrame2 > darkFrame1, `${darkFrame1} → ${darkFrame2}`)
await shot("02-moon-tree-dark")
await ev(toggleTheme)
await waitFor(() => ev(`!document.documentElement.classList.contains('dark')`))
await sleep(600)

/* ============ 清单 8：移动端 375（位置收缩 + 不挤） ============ */
await send("Emulation.setDeviceMetricsOverride", {
  width: 375,
  height: 812,
  deviceScaleFactor: 2,
  mobile: true,
})
await send("Page.reload")
await waitFor(() => ev(homeReady))
await ensureSakura()
await sleep(900)
const mob = await ev(sakura)
check(
  "8 375px：15 瓣 + 月亮/树位置收缩(0.5×)尺寸缩小(0.7×)且仍在视野内 + 无横向溢出",
  Boolean(mob) &&
    mob.count === 15 &&
    mob.sceneChildren === 17 &&
    mob.geo >= 10 &&
    mob.geo <= 24 &&
    mob.decor.moon.scale === 0.7 &&
    mob.decor.tree.scale === 0.7 &&
    Math.abs(mob.decor.moon.x) <= 2.0 &&
    Math.abs(mob.decor.tree.x) <= 2.0 &&
    Math.abs(mob.decor.moon.ndc.x) < 0.98 &&
    Math.abs(mob.decor.moon.ndc.y) < 0.98 &&
    Math.abs(mob.decor.tree.ndc.x) < 0.98 &&
    Math.abs(mob.decor.tree.ndc.y) < 0.98 &&
    (await ev(`document.documentElement.scrollWidth <= window.innerWidth + 1`)) === true,
  JSON.stringify(mob && { count: mob.count, scene: mob.sceneChildren, geo: mob.geo, moon: mob.decor.moon, tree: mob.decor.tree }),
)
await shot("03-mobile-375")
await send("Emulation.setDeviceMetricsOverride", {
  width: 1400,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
await send("Page.reload")
await waitFor(() => ev(homeReady))
await ensureSakura()
await sleep(1000)

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
check("9 搜索过滤正常", searchRes && afterSearch > 0 && afterSearch < searchRes.total, JSON.stringify({ total: searchRes && searchRes.total, afterSearch }))
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
    hitIsInput: hit === input || (hit && input.contains(hit)),
    count: s ? s.count : -1,
    moon: s ? s.moon.children.length : -1,
  }
})()`)
check(
  "9 AI 页可达 + 输入框命中自身（装饰层不挡交互，月亮/树在 ask 页同样渲染在最底层）",
  Boolean(askState) && askState.hitIsInput && askState.layerPE === "none" && askState.count === 40 && askState.moon === 2,
  JSON.stringify(askState),
)

/* ============ 清单 10：reduced-motion + 无 WebGL 降级 ============ */
await send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
})
await navigate(`${BASE}/#/`)
await send("Page.reload")
await waitFor(() => ev(homeReady))
await sleep(2500)
const reduced = await ev(`(() => ({
  layer: !!document.querySelector('.sakura3d-layer'),
  canvas: document.querySelectorAll('.sakura3d-layer canvas').length,
  burst: document.querySelectorAll('.sakura-layer').length,
  cards: document.querySelectorAll('.food-card').length,
}))()`)
check(
  "10 reduced-motion：无 3D 花瓣层（组件 return null），主站仍正常",
  Boolean(reduced) && !reduced.layer && reduced.canvas === 0 && reduced.cards > 0,
  JSON.stringify(reduced),
)
await send("Emulation.setEmulatedMedia", { features: [] })

// 无 WebGL：新文档脚本里干掉 WebGLRenderingContext → detectRuntime false → return null
const noGl = await send("Page.addScriptToEvaluateOnNewDocument", {
  source: "Object.defineProperty(window,'WebGLRenderingContext',{value:undefined,configurable:true});",
})
await send("Page.reload")
await waitFor(() => ev(homeReady))
await sleep(2000)
const noWebgl = await ev(`(() => ({
  layer: !!document.querySelector('.sakura3d-layer'),
  canvas: document.querySelectorAll('.sakura3d-layer canvas').length,
  cards: document.querySelectorAll('.food-card').length,
  webgl: typeof window.WebGLRenderingContext,
}))()`)
check(
  "10 无 WebGL：组件 return null（无 layer/canvas），主站不白屏",
  Boolean(noWebgl) && !noWebgl.layer && noWebgl.canvas === 0 && noWebgl.cards > 0 && noWebgl.webgl === "undefined",
  JSON.stringify(noWebgl),
)
if (noGl && noGl.identifier) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: noGl.identifier })
await send("Page.reload")
await waitFor(() => ev(homeReady))
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
