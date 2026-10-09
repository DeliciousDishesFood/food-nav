// task-19 · M10 AI 推荐闭环 + 工作台交互修复 —— CDP 浏览器验收脚本
// 访问本地 pages dev（http://127.0.0.1:8788，dist + Functions，GLM 走 .dev.vars）
// 用法：node dev-docs/reports/task-19/t19-accept.mjs
// 前置：Edge 以 --remote-debugging-port=9222 + 独立 --user-data-dir 启动（窗口保持可见）
// 证据：acceptance-log.txt · 01~06 截图
import { mkdir, writeFile } from 'node:fs/promises'

const BASE = 'http://127.0.0.1:8788'
const CDP = 'http://127.0.0.1:9222'
const ROOT = 'E:/react/food-nav'
const OUT = `${ROOT}/dev-docs/reports/task-19`

await mkdir(OUT, { recursive: true })

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

await send('Page.enable')
await send('Runtime.enable')
await send('Network.enable')
// 窗口必须可见（STATUS 坑点：隐藏/最小化 → 渲染进程定时器与 awaitPromise 被挂起，AI 流式会假死）
await send('Page.bringToFront')
const visibility = await (async () => {
  const r = await send('Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true })
  return r.result ? r.result.value : 'unknown'
})()
console.log(`visibility: ${visibility}`)
if (visibility !== 'visible') {
  console.error('FATAL: 浏览器窗口不可见（请把 Edge 窗口带到前台/取消最小化后重跑）')
  process.exit(2)
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
    await sleep(200)
  }
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
const reload = async () => {
  await send('Page.reload', { ignoreCache: false })
  await waitFor(async () => (await evaluate(`document.readyState`)) === 'complete', 20000)
  await sleep(500)
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
const shot = async (file) => {
  const res = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${OUT}/${file}`, Buffer.from(res.data, 'base64'))
  note(`screenshot → ${file}`)
}

/* ================= 页面表达式助手 ================= */
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

/* ================= 0. 清场 ================= */
await setViewport(1280, 860, false)
await navigate(`${BASE}/#/`)
await evaluate(`(() => { localStorage.removeItem('food-nav:ask-history'); return true })()`)
note('localStorage ask-history cleared')

/* ================= 1. AI 推荐闭环 ================= */
console.log('\n[1] AI 推荐闭环: 问推荐 → 推荐卡 → 主体点击追问 → 复用发送链路')
await navigate(`${BASE}/#/ask`)
const wsReady = await poll(`Boolean(${H1_SAKURA}) && Boolean(${TEXTAREA})`, 15000)
check('工作台渲染（h1 樱见 + composer）', wsReady === true)

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
  return {
    target: a.getAttribute('target'),
    rel: a.getAttribute('rel'),
    w: Math.round(r.width),
    h: Math.round(r.height),
    aria: a.getAttribute('aria-label'),
  }
})()`)
check(
  '角落按钮：target=_blank + rel=noopener',
  Boolean(openInfo) && openInfo.target === '_blank' && /noopener/.test(openInfo.rel || ''),
  JSON.stringify(openInfo),
)
check(
  '角落按钮：触控目标 ≥40×40',
  Boolean(openInfo) && openInfo.w >= 40 && openInfo.h >= 40,
  JSON.stringify(openInfo),
)
check(
  '角落按钮：aria-label=打开…站点',
  Boolean(openInfo) && /^打开.+站点$/.test(openInfo.aria || ''),
  JSON.stringify(openInfo?.aria),
)

const cardMainInfo = await evaluate(`(() => {
  const b = document.querySelector('${CARD_MAIN}')
  if (!b) return null
  return { tag: b.tagName, aria: b.getAttribute('aria-label') }
})()`)
check(
  '卡片主体是 <button>（不再整卡外链）',
  Boolean(cardMainInfo) && cardMainInfo.tag === 'BUTTON',
  JSON.stringify(cardMainInfo),
)
check(
  '卡片主体 aria-label=关于…继续追问',
  Boolean(cardMainInfo) && /^关于.+继续追问$/.test(cardMainInfo.aria || ''),
  JSON.stringify(cardMainInfo?.aria),
)

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
check(
  '追问问句与手输消息同构（用户气泡 +1）',
  Boolean(followMsg) && followMsg === beforeClick + 1,
  `${beforeClick} → ${followMsg}`,
)
await sleep(1500)
await shot('01-ask-recommend-ask.png')

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

/* ================= 2. 返回工作台 ================= */
console.log('\n[2] 对话中返回工作台（保留历史，不清空）')
const backBtn = await waitFor(() => evaluate(`Boolean(document.querySelector('${BACK_WS}'))`), 10000)
check('对话态 header 出现「返回工作台」', backBtn === true)
const backDisabled = await evaluate(`(() => { const b = document.querySelector('${BACK_WS}'); return b ? b.disabled : null })()`)
check('生成结束后返回按钮可用', backDisabled === false, String(backDisabled))

const clickedBack = await clickSelector(BACK_WS)
check('点击返回工作台', clickedBack === true)
const onWorkspace = await poll(`Boolean(${H1_SAKURA})`, 8000)
check('回到工作台（h1 樱见）', onWorkspace === true)
check('对话流已退出', (await poll(`(${USER_BUBBLES}).length === 0`, 4000)) === true)

const sessionAfterBack = await evaluate(`${SESSIONS}`)
check(
  '会话进「最近会话」面板（localStorage sessions ≥1）',
  Array.isArray(sessionAfterBack) && sessionAfterBack.length >= 1,
  JSON.stringify(sessionAfterBack ? sessionAfterBack.length : null),
)
const hasFollow = await evaluate(
  `(${SESSIONS}).some(s => (s.messages || []).some(m => (m.content || '').includes('这个站点「')))`,
)
check('返回后会话内容含站点追问消息', hasFollow === true)

const rows = await waitFor(() => evaluate(`document.querySelectorAll('${DELETE_BTN}').length`), 8000)
check('面板出现该会话行（含删除按钮）', rows >= 1, `rows=${rows}`)
await shot('02-ask-back-workspace.png')

const resumed = await clickExpr(RESUME_BTN)
check('点击「继续对话」恢复', resumed === true)
check(
  '恢复的对话含追问问句（记忆链路正常）',
  (await poll(
    `[...document.querySelectorAll('.ask-bubble-me')].some(x => (x.textContent||'').includes('这个站点「'))`,
    8000,
  )) === true,
)

/* ================= 3. 会话单条删除 + 10 条上限 ================= */
console.log('\n[3] 会话单条删除 / 删空空态 / clamp 10')
await clickSelector(BACK_WS)
check('返回工作台（分离当前会话）', (await poll(`Boolean(${H1_SAKURA})`, 8000)) === true)

// 第二条会话：工作台直接提问 → 新会话；旧会话保留在面板
await sendAndFinish('舒芙蕾为什么会塌？', '第二会话')
await clickSelector(BACK_WS)
await poll(`Boolean(${H1_SAKURA})`, 8000)

const rows2 = await evaluate(`document.querySelectorAll('${DELETE_BTN}').length`)
const sess2 = await evaluate(`${SESSIONS}.length`)
check('两条会话并存（面板 2 行 / storage 2 条）', rows2 === 2 && sess2 === 2, `rows=${rows2} sessions=${sess2}`)
await shot('03a-ask-history-two-rows.png')

const delSize = await evaluate(`(() => {
  const btns = [...document.querySelectorAll('${DELETE_BTN}')]
  if (!btns.length) return null
  const target = btns[btns.length - 1]
  const r = target.getBoundingClientRect()
  target.click()
  return { w: Math.round(r.width), h: Math.round(r.height) }
})()`)
check('删除按钮触控目标 ≥40×40', Boolean(delSize) && delSize.w >= 40 && delSize.h >= 40, JSON.stringify(delSize))
await sleep(400)
const rowsAfter = await evaluate(`document.querySelectorAll('${DELETE_BTN}').length`)
const sessAfter = await evaluate(`${SESSIONS}.length`)
check('删一条 → 面板与 localStorage 同步（2→1）', rowsAfter === 1 && sessAfter === 1, `rows=${rowsAfter} sessions=${sessAfter}`)
await shot('03-ask-history-delete.png')

await clickExpr(`[...document.querySelectorAll('${DELETE_BTN}')][0]`)
await sleep(400)
check('删空 → 面板空态引导', (await evaluate(`${EMPTY_TIP}`)) === true)
check('删空 → localStorage 键移除', (await evaluate(`localStorage.getItem('food-nav:ask-history') === null`)) === true)

// clamp 10：注入 12 条 → 刷新（默认恢复最新一条进对话态）→ 返回工作台看面板
await evaluate(`(() => {
  const sessions = []
  const now = Date.now()
  for (let i = 12; i >= 1; i -= 1) {
    sessions.push({
      id: now - i,
      savedAt: now - i,
      messages: [{ id: 1, role: 'user', content: '会话 ' + i, status: 'done', sites: [] }],
    })
  }
  localStorage.setItem('food-nav:ask-history', JSON.stringify({ savedAt: now, sessions }))
  return localStorage.getItem('food-nav:ask-history') ? 12 : 0
})()`)
await reload()
await clickSelector(BACK_WS)
check('clamp：刷新恢复会话后可返回工作台', (await poll(`Boolean(${H1_SAKURA})`, 8000)) === true)
const clampRows = await waitFor(() => evaluate(`document.querySelectorAll('${DELETE_BTN}').length`), 10000)
check('12 条注入 → 面板只显示 10 行（读取层截断）', clampRows === 10, `rows=${clampRows}`)
const clampSess = await evaluate(`${SESSIONS}.length`)
check('12 条注入 → 返回工作台 flush 后 storage 落 10 条', clampSess === 10, `sessions=${clampSess}`)

await clickExpr(RESUME_BTN)
check('clamp 场景可恢复会话', (await poll(`(${USER_BUBBLES}).length > 0`, 6000)) === true)
await clickSelector(BACK_WS)
await poll(`Boolean(${H1_SAKURA})`, 6000)
const clampWrite = await evaluate(`${SESSIONS}.length`)
check('写入路径同样 clamp 10', clampWrite === 10, `sessions=${clampWrite}`)

/* ================= 4. 路由切换过渡 ================= */
console.log('\n[4] 路由 180ms 轻淡入 + reduced-motion')
await navigate(`${BASE}/#/`)
const routeAnim = await evaluate(`(() => {
  const el = document.querySelector('.route-fade')
  if (!el) return null
  const cs = getComputedStyle(el)
  return { name: cs.animationName, duration: cs.animationDuration, pe: cs.pointerEvents }
})()`)
check('主站路由外壳带 route-fade 动画', Boolean(routeAnim) && routeAnim.name === 'route-fade-in', JSON.stringify(routeAnim))
check('动画时长 0.18s', Boolean(routeAnim) && routeAnim.duration === '0.18s', JSON.stringify(routeAnim))
check('过渡不遮挡交互（pointer-events=auto）', Boolean(routeAnim) && routeAnim.pe === 'auto', JSON.stringify(routeAnim))

await setReducedMotion(true)
const rmAnim = await evaluate(`(() => {
  const el = document.querySelector('.route-fade')
  return el ? getComputedStyle(el).animationName : null
})()`)
check('reduced-motion：路由动画关闭', rmAnim === 'none', String(rmAnim))

/* ================= 5. 全局点击樱花散花 ================= */
console.log('\n[5] 点击樱花动效（3-5 片 / 300ms 限频 / 1s 消失 / reduced-motion 不触发）')
const waitPetalsClear = () =>
  waitFor(() => evaluate(`document.querySelectorAll('.sakura-petal').length === 0`), 4000)

// reduced-motion：先等上一轮残留花瓣清空，再点击，应为 0 片
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
  return {
    count: ps.length,
    pe: layer ? getComputedStyle(layer).pointerEvents : null,
    aria: layer ? layer.getAttribute('aria-hidden') : null,
  }
})()`)
check('单击生成 3-5 片花瓣', petal1.count >= 3 && petal1.count <= 5, JSON.stringify(petal1))
check('花瓣层 pointer-events:none + aria-hidden', petal1.pe === 'none' && petal1.aria === 'true', JSON.stringify(petal1))
await shot('05-sakura-burst.png')

const burst2 = await evaluate(`(() => {
  const fire = (x, y) => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }))
  fire(640, 420)
  const after1 = document.querySelectorAll('.sakura-petal').length
  fire(700, 460)
  const after2 = document.querySelectorAll('.sakura-petal').length
  return { after1, after2 }
})()`)
check('300ms 限频：同刻连点两次花瓣数不增加', burst2.after2 === burst2.after1, JSON.stringify(burst2))

const gone = await waitFor(
  () => evaluate(`document.querySelectorAll('.sakura-petal').length === 0`),
  4000,
)
check('花瓣 ~1s 后消失并移除 DOM', gone === true)

await navigate(`${BASE}/#/`)
const entryClicked = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').includes('问问樱见'))
  if (!b) return 'no-entry'
  b.click()
  return 'clicked'
})()`)
const jumped = await poll(`location.hash.startsWith('#/ask')`, 6000)
check('散花监听不拦截默认行为（入口点击正常跳转）', entryClicked === 'clicked' && jumped === true, `${entryClicked}/${jumped}`)

/* ================= 6/7. 暗色主题 ================= */
console.log('\n[6][7] 暗色主题下的新交互')
await clickSelector(BACK_WS)
await poll(`Boolean(${H1_SAKURA})`, 8000)
await evaluate(`(() => { document.documentElement.classList.add('dark'); return true })()`)
await sleep(300)
const darkPanel = await evaluate(`(() => { const p = document.querySelector('.ask-panel'); return p ? getComputedStyle(p).backgroundColor : null })()`)
check('暗色下 ask-panel 生效', Boolean(darkPanel) && darkPanel !== 'rgba(0, 0, 0, 0)', String(darkPanel))
const darkDel = await evaluate(`(() => { const b = document.querySelector('${DELETE_BTN}'); return b ? getComputedStyle(b).color : null })()`)
check('暗色下删除按钮有可见颜色', Boolean(darkDel) && darkDel !== 'rgba(0, 0, 0, 0)', String(darkDel))
await shot('06-dark.png')
await evaluate(`(() => { document.documentElement.classList.remove('dark'); return true })()`)

/* ================= 8/10. 375 移动端 ================= */
console.log('\n[8][10] 375：header 不溢出 / 触控目标')
await setViewport(375, 760, true)
await sleep(400)
const resumedMobile = await clickExpr(RESUME_BTN)
if (!resumedMobile) note('375 下无会话行可恢复')
await poll(`(${USER_BUBBLES}).length > 0`, 8000)
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
    backHome: rect(backHome),
    backWs: rect(backWs),
    clear: rect(clear),
  }
})()`)
check('375：整页无横向溢出（对话态）', mobileHeader && mobileHeader.overflowX === false, JSON.stringify(mobileHeader))
check(
  '375：header 按钮组在视口内（返回主站|返回工作台 … |清空）',
  Boolean(mobileHeader) && mobileHeader.groupLeft >= 0 && mobileHeader.groupRight <= mobileHeader.inner,
  JSON.stringify(mobileHeader),
)
check(
  '375：返回工作台按钮可点（≥36×36，与既有 header 图标钮同规格）',
  Boolean(mobileHeader?.backWs) && mobileHeader.backWs.h >= 36 && mobileHeader.backWs.w >= 36,
  JSON.stringify(mobileHeader?.backWs),
)
const mobileCard = await evaluate(`(() => {
  const a = document.querySelector('${CARD_OPEN}')
  if (!a) return null
  const r = a.getBoundingClientRect()
  return { w: Math.round(r.width), h: Math.round(r.height) }
})()`)
if (mobileCard) {
  check('375：打开站点按钮 ≥40×40', mobileCard.w >= 40 && mobileCard.h >= 40, JSON.stringify(mobileCard))
} else {
  note('375 对话态无推荐卡（恢复的会话无 sites）→ 桌面已断言按钮尺寸')
}
await shot('04-mobile-375.png')

await clickSelector(BACK_WS)
await poll(`Boolean(${H1_SAKURA})`, 6000)
const mobileDel = await evaluate(`(() => {
  const b = document.querySelector('${DELETE_BTN}')
  if (!b) return null
  const r = b.getBoundingClientRect()
  return { w: Math.round(r.width), h: Math.round(r.height) }
})()`)
check(
  '375：最近会话删除按钮 ≥40×40',
  Boolean(mobileDel) && mobileDel.w >= 40 && mobileDel.h >= 40,
  JSON.stringify(mobileDel),
)
check('375：整页无横向溢出（工作台）', (await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`)) === true)

/* ================= 6. 主站回归 ================= */
console.log('\n[6] 回归：主站渲染 / 外链结构')
await setViewport(1280, 860, false)
await navigate(`${BASE}/#/`)
const homeOk = await waitFor(
  () =>
    evaluate(`(() => {
      const entry = [...document.querySelectorAll('button')].some(b => (b.textContent||'').includes('问问樱见'))
      const tabs = document.querySelectorAll('button').length
      return entry && tabs > 3 ? { tabs } : null
    })()`),
  15000,
)
check('主站渲染（问问樱见入口 + 导航按钮）', Boolean(homeOk), 'timeout')
const externalLinks = await evaluate(`document.querySelectorAll('a[target="_blank"][rel*="noopener"]').length`)
check('主站外链结构仍在（a[target=_blank]）', externalLinks > 0, `count=${externalLinks}`)

/* ================= 收尾 ================= */
const logLines = [
  'task-19 · M10 CDP 验收日志',
  `base: ${BASE}`,
  `time: ${new Date().toISOString()}`,
  '',
  ...results,
  '',
  ...notes,
  '',
  `RESULT: ${pass} passed / ${fail} failed`,
]
await writeFile(`${OUT}/acceptance-log.txt`, logLines.join('\n'), 'utf8')
console.log(`\nRESULT: ${pass} passed / ${fail} failed  →  ${OUT}/acceptance-log.txt`)
ws.close()
process.exit(fail > 0 ? 1 : 0)
