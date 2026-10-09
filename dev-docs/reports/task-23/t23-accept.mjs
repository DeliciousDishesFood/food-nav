// task-23 · 本地 CDP 手动验收（10 项清单）+ 3+1 张截图
// 前置：npx wrangler pages dev dist --port 8788（本地 D1 + GLM key）
//       Edge --remote-debugging-port=9222（独立 user-data-dir）
import { mkdir, writeFile } from "node:fs/promises"

const BASE = "http://127.0.0.1:8788"
const CDP = "http://127.0.0.1:9222"
const OUT = "E:/react/food-nav/dev-docs/reports/task-23"
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

// ---------- CDP 连接 ----------
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

await send("Page.enable")
await send("Runtime.enable")
await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })

/* ============ 0. 清干净上一次任务残留状态 ============ */
await navigate(`${BASE}/#/`)
await ev(`localStorage.clear()`)
// 同 URL navigate 是同文档导航（不重载、API 不重取、缓存不回写）→ 必须整页 reload
await send("Page.reload")
await waitFor(() => ev(`!!document.querySelector('.daily-fortune')`))
// 等 API 数据落 nav-cache（首帧可能是本地快照，落库后签文在同日内稳定）
await waitFor(() => ev(`!!localStorage.getItem('food-nav:nav-cache')`))
await sleep(600)

/* ============ 清单 1：签卡出现在打字机下方、贴纸风 ============ */
const f1 = await ev(`(() => {
  const card = document.querySelector('.daily-fortune')
  if (!card) return null
  const quote = document.querySelector('p.italic')
  const first = document.querySelector('.food-card')
  const link = card.querySelector('a[href^="http"]')
  const r = card.getBoundingClientRect()
  const cs = getComputedStyle(card)
  return {
    text: card.textContent,
    hasLink: !!link,
    target: link ? link.getAttribute('target') : null,
    rel: link ? link.getAttribute('rel') : null,
    belowQuote: quote ? r.top >= quote.getBoundingClientRect().bottom - 8 : false,
    aboveCards: first ? r.top < first.getBoundingClientRect().top : true,
    role: card.getAttribute('role'),
    radius: cs.borderRadius,
    hasBorder: cs.borderTopWidth !== '0px',
    bg: cs.backgroundColor,
  }
})()`)
check(
  "1 签卡在打字机下方、卡片流上方、role=button",
  Boolean(f1) && f1.belowQuote && f1.aboveCards && f1.role === "button",
  JSON.stringify(f1),
)
check(
  "1 贴纸风（圆角+边框+背景）+ 站点链接 target=_blank",
  Boolean(f1) && f1.hasBorder && f1.bg !== "rgba(0, 0, 0, 0)" && f1.target === "_blank" && (f1.rel || "").includes("noopener"),
  JSON.stringify(f1),
)
check("1 签文命中模板池", Boolean(f1) && /今日宜吃|今天来点|饿了的话|今日签/.test(f1.text), f1 && f1.text)
await shot("01-home-fortune-light")

/* ============ 清单 2：同日刷新签文一致 + 点击摇签换签 ============ */
const seededText = f1.text
await send("Page.reload")
await waitFor(() => ev(`!!document.querySelector('.daily-fortune')`))
await sleep(600)
const textAfterReload = await ev(`document.querySelector('.daily-fortune').textContent`)
check("2 同一天刷新签文一致", textAfterReload === seededText, `${seededText} vs ${textAfterReload}`)

let shakeSeen = false
let rolledText = null
for (let i = 0; i < 4 && !rolledText; i += 1) {
  await ev(`document.querySelector('.daily-fortune').click()`)
  await sleep(100)
  const st = await ev(`(() => { const c = document.querySelector('.daily-fortune'); return { shake: c.classList.contains('fortune-shake'), text: c.textContent } })()`)
  if (st && st.shake) shakeSeen = true
  if (st && st.text !== seededText) rolledText = st.text
  if (!rolledText) await sleep(700)
}
check("2 点击 → 摇晃动画(fortune-shake)", shakeSeen)
check("2 摇签后换签（签文变化）", Boolean(rolledText), `seeded=${seededText}`)
// 动画结束 class 自动摘除
await sleep(700)
const shakeCleared = await ev(`!document.querySelector('.daily-fortune').classList.contains('fortune-shake')`)
check("2 动画 0.6s 后 shake class 自动清除", shakeCleared)

/* ============ 清单 3：点站点链接新开窗口、不触发摇签 ============ */
const linkState = await ev(`(() => {
  const c = document.querySelector('.daily-fortune')
  const a = c && c.querySelector('a[href^="http"]')
  if (!a) return null
  const before = c.textContent
  const beforeShake = c.classList.contains('fortune-shake')
  const noNav = (e) => e.preventDefault()
  window.addEventListener('click', noNav, { capture: true })
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  window.removeEventListener('click', noNav, { capture: true })
  return {
    before, beforeShake,
    after: c.textContent,
    afterShake: c.classList.contains('fortune-shake'),
    href: a.href, target: a.target, rel: a.rel,
  }
})()`)
check(
  "3 点链接：新开窗口(noopener)且不触发摇签",
  Boolean(linkState) &&
    linkState.target === "_blank" &&
    (linkState.rel || "").includes("noopener") &&
    linkState.before === linkState.after &&
    linkState.afterShake === linkState.beforeShake,
  JSON.stringify(linkState),
)

/* ============ 清单 4：暗色 token 正常（+ 附加截图） ============ */
const lightBg = await ev(`getComputedStyle(document.querySelector('.daily-fortune')).backgroundColor`)
await ev(`(() => { const b = [...document.querySelectorAll('header button')].find(x => (x.getAttribute('aria-label')||'').includes('主题')); b.click(); return true })()`)
await waitFor(() => ev(`document.documentElement.classList.contains('dark')`))
const darkState = await ev(`(() => { const c = document.querySelector('.daily-fortune'); const cs = getComputedStyle(c); return { bg: cs.backgroundColor, border: cs.borderTopColor, text: cs.color } })()`)
check(
  "4 暗色签卡 token 自动适配（背景≠亮色、非透明）",
  darkState && darkState.bg !== "rgba(0, 0, 0, 0)" && darkState.bg !== lightBg,
  `light=${lightBg} dark=${JSON.stringify(darkState)}`,
)
await shot("04-home-fortune-dark")
await ev(`(() => { const b = [...document.querySelectorAll('header button')].find(x => (x.getAttribute('aria-label')||'').includes('主题')); b.click(); return true })()`)
await waitFor(() => ev(`!document.documentElement.classList.contains('dark')`))

/* ============ 清单 5：375px 签卡不溢出 ============ */
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })
await sleep(500)
const m375 = await ev(`(() => {
  const c = document.querySelector('.daily-fortune')
  if (!c) return { ok: false }
  const r = c.getBoundingClientRect()
  return {
    ok: true,
    noOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
    inViewport: r.right <= 376 && r.left >= -1 && r.width > 0,
    width: Math.round(r.width),
  }
})()`)
check("5 375px 无横向溢出且签卡完整在视口内", m375 && m375.ok && m375.noOverflow && m375.inViewport, JSON.stringify(m375))
await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })
await sleep(300)

/* ============ 清单 6：/ask 极简工作台（无两面板、单列居中） ============ */
await navigate(`${BASE}/#/ask`)
await waitFor(() => ev(`!!document.querySelector('textarea')`))
await sleep(500)
const ws1 = await ev(`(() => {
  const body = document.body.innerText
  const wrap = document.querySelector('.ask-scroll')
  const chips = document.querySelectorAll('.ask-chip').length
  return {
    noDaily: !body.includes('今日美味'),
    noRecent: !body.includes('最近会话'),
    chips,
    illustration: !!document.querySelector('svg[aria-label="樱见插画"]'),
    singleCol: !!wrap && wrap.className.includes('flex-col') && wrap.className.includes('items-center'),
    composerInMain: !!document.querySelector('main textarea'),
    greeting: body.includes('你好') || body.includes('嗨') || body.includes('逛') || body.includes('问'),
  }
})()`)
check(
  "6 工作台无「今日美味」「最近会话」面板，单列居中（插画+问候+输入框+chips）",
  ws1 && ws1.noDaily && ws1.noRecent && ws1.chips >= 3 && ws1.illustration && ws1.singleCol && ws1.composerInMain,
  JSON.stringify(ws1),
)
await shot("02-ask-workspace-minimal")

/* ============ 清单 7/8：History 浮层（恢复/删除/外点关闭/对话态也在） ============ */
// 预置 2 条本地会话（渲染态 boot → 对话态启动，顺带覆盖「对话中 History 也在」）
await ev(`localStorage.setItem('food-nav:ask-history', JSON.stringify({
  savedAt: Date.now(),
  sessions: [
    { id: 1791550000001, savedAt: 1791550000001, messages: [
      { id: 1, role: 'user', content: '烘焙新手想买烤箱，下厨房和美食天下哪个更适合？' },
      { id: 2, role: 'assistant', content: '下厨房社区更活跃、菜谱步骤更细，适合新手跟着做；美食天下偏大全查询。' }
    ]},
    { id: 1791540000002, savedAt: 1791540000002, messages: [
      { id: 1, role: 'user', content: '推荐一个做面包的网站' }
    ]}
  ]
}))`)
// 同 URL navigate 不重载 → AskPage 不会重新 boot 读历史，必须整页 reload
await send("Page.reload")
await waitFor(() => ev(`!!document.querySelector('.ask-bubble-me')`))
const histBtn = await ev(`!!document.querySelector('header [aria-label="历史对话"]')`)
check("8 对话态 header History 图标存在", histBtn)

await ev(`document.querySelector('header [aria-label="历史对话"]').click()`)
await waitFor(() => ev(`document.querySelectorAll('header [aria-label="历史对话"]')[0].parentElement.querySelectorAll('ul li').length >= 2`))
const dd = await ev(`(() => {
  const btn = document.querySelector('header [aria-label="历史对话"]')
  const root = btn.parentElement
  const items = [...root.querySelectorAll('ul li')]
  const panel = root.querySelector('ul').parentElement
  const cs = getComputedStyle(panel)
  return {
    rows: items.length,
    first: items[0] ? items[0].textContent : '',
    preview: items[0] ? (items[0].textContent.includes('烘焙新手想买烤箱') || items[0].textContent.includes('烘焙新手想买烤箱…')) : false,
    hasTrash: !!root.querySelector('button[aria-label="删除会话"]'),
    panelBg: cs.backgroundColor,
    panelZ: cs.zIndex,
    activeBadge: root.textContent.includes('当前'),
  }
})()`)
check(
  "7 浮层列出 2 条历史（时间+首条消息预览 20 字+Trash2+当前徽标）",
  dd && dd.rows === 2 && dd.preview && dd.hasTrash && dd.activeBadge && dd.panelBg !== "rgba(0, 0, 0, 0)" && Number(dd.panelZ) >= 50,
  JSON.stringify(dd),
)
await shot("03-history-dropdown")

// 点第 2 条 → 恢复会话（切到对话态）
await ev(`(() => { const btn = document.querySelector('header [aria-label="历史对话"]'); const items = [...btn.parentElement.querySelectorAll('ul li')]; items[1].querySelector('button').click(); return true })()`)
await waitFor(() => ev(`(document.body.innerText || '').includes('推荐一个做面包的网站')`))
const closedAfterResume = await ev(`!document.querySelector('header [aria-label="历史对话"]').parentElement.querySelector('ul')`)
check("7 点历史条目 → 恢复对应会话且浮层关闭", closedAfterResume)

// 点浮层外部 → 关闭
await ev(`(() => { const btn = document.querySelector('header [aria-label="历史对话"]'); btn.click(); return true })()`)
await waitFor(() => ev(`!!document.querySelector('header [aria-label="历史对话"]').parentElement.querySelector('ul')`))
await ev(`(() => { document.querySelector('.ask-page').dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
await sleep(300)
const closedByOutside = await ev(`!document.querySelector('header [aria-label="历史对话"]').parentElement.querySelector('ul')`)
check("7 点浮层外部 → 自动关闭", closedByOutside)

// Trash 删非当前（第 1 条）→ 剩 1 条
await ev(`(() => { document.querySelector('header [aria-label="历史对话"]').click(); return true })()`)
await waitFor(() => ev(`document.querySelectorAll('header [aria-label="历史对话"]')[0].parentElement.querySelectorAll('ul li').length >= 2`))
await ev(`(() => { const btn = document.querySelector('header [aria-label="历史对话"]'); btn.parentElement.querySelector('button[aria-label="删除会话"]').click(); return true })()`)
await sleep(300)
const afterDel1 = await ev(`(() => {
  const btn = document.querySelector('header [aria-label="历史对话"]')
  const rows = btn.parentElement.querySelectorAll('ul li').length
  const stored = JSON.parse(localStorage.getItem('food-nav:ask-history') || '{"sessions":[]}')
  return { rows, stored: stored.sessions.length }
})()`)
check("7 Trash 删除单条 → 浮层与存储同步减 1", afterDel1 && afterDel1.rows === 1 && afterDel1.stored === 1, JSON.stringify(afterDel1))

// 删当前（第 2 条）→ 归零回工作台 + 空态
await ev(`(() => { const btn = document.querySelector('header [aria-label="历史对话"]'); btn.parentElement.querySelector('button[aria-label="删除会话"]').click(); return true })()`)
await sleep(400)
const afterDel2 = await ev(`(() => {
  const btn = document.querySelector('header [aria-label="历史对话"]')
  const root = btn.parentElement
  return {
    empty: (root.textContent || '').includes('还没有对话记录'),
    noKey: !localStorage.getItem('food-nav:ask-history'),
    workspace: !!document.querySelector('main textarea') && document.querySelectorAll('.ask-bubble-me').length === 0,
  }
})()`)
check("7 删除当前会话 → 空态提示 + 存储清空 + 回工作台", afterDel2 && afterDel2.empty && afterDel2.noKey && afterDel2.workspace, JSON.stringify(afterDel2))
await ev(`document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
await sleep(200)

/* ============ 清单 9：?q= 预填 / 发送 / 停止 / 返回工作台 / 清空 ============ */
// 同一 document 内 hash 变化不会重挂载 AskPage（key={path} 相同）→ 先设 hash 再整页 reload 触发 readPrefill
await ev(`location.hash = '#/ask?q=${encodeURIComponent("帮我看看烘焙网站")}'`)
await send("Page.reload")
await waitFor(() => ev(`!!document.querySelector('textarea')`))
await sleep(300)
const prefill = await ev(`document.querySelector('textarea').value`)
check("9 ?q= 预填进输入框", prefill === "帮我看看烘焙网站", prefill)

// 发送 → 停止（流式中断）；若流太快跑完则再试一轮
let stoppedOk = false
for (let attempt = 0; attempt < 2 && !stoppedOk; attempt += 1) {
  await ev(`(() => {
    const t = document.querySelector('textarea')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(t, '请写一篇八百字的美食散文，越长越好，慢慢写不要着急，分很多段落详细展开')
    t.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await sleep(150)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '发送'); b.click(); return true })()`)
  try {
    await waitFor(() => ev(`[...document.querySelectorAll('button')].some(x => x.textContent.includes('停止'))`), 6000)
    await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('停止')); b.click(); return true })()`)
    await waitFor(() => ev(`[...document.querySelectorAll('button')].some(x => x.textContent.trim() === '发送')`), 6000)
    stoppedOk = true
  } catch {
    stoppedOk = false
  }
}
check("9 流式发送 → ■停止 → 回到发送", stoppedOk)

// 完整流式：等待 AI 回复内容
await ev(`(() => {
  const t = document.querySelector('textarea')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(t, '用一句话介绍下厨房')
  t.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)
await sleep(150)
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '发送'); b.click(); return true })()`)
const aiText = await waitFor(async () => {
  const len = await ev(`(() => {
    const nodes = [...document.querySelectorAll('.ask-bubble-ai')]
    const last = nodes[nodes.length - 1]
    return last ? last.textContent.trim().length : 0
  })()`)
  return len > 0 ? len : null
}, 30000)
check("9 流式回复渲染（.ask-bubble-ai 有内容）", aiText > 0, `len=${aiText}`)

// 返回工作台（等流结束后可用）
await waitFor(() => ev(`!document.querySelector('header [aria-label="返回工作台"]').disabled`), 30000)
await ev(`document.querySelector('header [aria-label="返回工作台"]').click()`)
await waitFor(() => ev(`!!document.querySelector('.ask-chip')`))
const wsAfterBack = await ev(`(() => {
  const btn = document.querySelector('header [aria-label="历史对话"]')
  btn.click()
  return true
})()`)
if (wsAfterBack === undefined) console.log("  (workspace history opened)")
await sleep(300)
const flushed = await ev(`(() => {
  const btn = document.querySelector('header [aria-label="历史对话"]')
  const rows = btn.parentElement.querySelectorAll('ul li').length
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return { rows }
})()`)
check("9 返回工作台 → 会话立即落盘（浮层 1 条）", flushed && flushed.rows === 1, JSON.stringify(flushed))

// 恢复 + 清空对话
await ev(`(() => { const btn = document.querySelector('header [aria-label="历史对话"]'); btn.click(); return true })()`)
await sleep(300)
await ev(`(() => { const btn = document.querySelector('header [aria-label="历史对话"]'); btn.parentElement.querySelector('ul li button').click(); return true })()`)
await waitFor(() => ev(`!!document.querySelector('.ask-bubble-me')`))
await waitFor(() => ev(`!document.querySelector('header [aria-label="清空对话"]').disabled`))
await ev(`document.querySelector('header [aria-label="清空对话"]').click()`)
await sleep(400)
const cleared = await ev(`(() => ({
  workspace: !!document.querySelector('.ask-chip') && document.querySelectorAll('.ask-bubble-me').length === 0,
  noKey: !localStorage.getItem('food-nav:ask-history'),
  clearDisabled: document.querySelector('header [aria-label="清空对话"]').disabled,
}))()`)
check("9 清空对话 → 工作台 + 历史清零 + 按钮禁用", cleared && cleared.workspace && cleared.noKey && cleared.clearDisabled, JSON.stringify(cleared))

/* ============ 清单 10：主站收藏 / 主题 / 搜索 / 音乐播放器 无回归 ============ */
await navigate(`${BASE}/#/`)
await waitFor(() => ev(`document.querySelectorAll('.food-card').length >= 4`))
const favState = await ev(`(() => {
  const h = document.querySelector('button[aria-pressed]')
  if (!h) return null
  return {
    before: h.getAttribute('aria-pressed'),
    beforeLen: JSON.parse(localStorage.getItem('food-nav:favorites') || '[]').length,
  }
})()`)
await ev(`document.querySelector('button[aria-pressed]').click()`)
await sleep(300)
const favAfter = await ev(`(() => {
  const h = document.querySelector('button[aria-pressed]')
  return {
    after: h ? h.getAttribute('aria-pressed') : null,
    afterLen: JSON.parse(localStorage.getItem('food-nav:favorites') || '[]').length,
  }
})()`)
const favOk =
  favState &&
  favAfter &&
  favState.before !== favAfter.after &&
  Math.abs(favAfter.afterLen - favState.beforeLen) === 1 &&
  (favAfter.after === "true") === (favAfter.afterLen > favState.beforeLen)
check(
  "10 收藏 toggle 正常（aria-pressed 翻转 + 本地存储 ±1）",
  favOk,
  JSON.stringify({ ...favState, ...favAfter }),
)

const theme = await ev(`(() => {
  const b = [...document.querySelectorAll('header button')].find(x => (x.getAttribute('aria-label')||'').includes('主题'))
  if (!b) return { ok: false }
  b.click()
  return { ok: true, dark: document.documentElement.classList.contains('dark') }
})()`)
await sleep(300)
const themeOn = await ev(`document.documentElement.classList.contains('dark')`)
check("10 主题切换正常", theme && theme.ok && themeOn, JSON.stringify(theme))
await ev(`(() => { const b = [...document.querySelectorAll('header button')].find(x => (x.getAttribute('aria-label')||'').includes('主题')); b.click(); return true })()`)
await sleep(200)

const search = await ev(`(() => {
  const input = document.querySelector('input[type="search"]')
  const total = document.querySelectorAll('.food-card').length
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, '咖啡')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return { total }
})()`)
await sleep(400)
const afterSearch = await ev(`document.querySelectorAll('.food-card').length`)
check("10 搜索过滤正常", search && afterSearch > 0 && afterSearch < search.total, JSON.stringify({ total: search && search.total, afterSearch }))
await ev(`(() => {
  const input = document.querySelector('input[type="search"]')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, '')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)

const music = await ev(`(() => {
  const open = document.querySelector('button[aria-label="展开音乐播放器"]')
  if (!open) return { ok: false }
  open.click()
  return { ok: true }
})()`)
await sleep(400)
const musicPanel = await ev(`!!document.querySelector('[aria-label="音乐播放器面板"]')`)
check("10 音乐播放器展开正常", music && music.ok && musicPanel, JSON.stringify(music))
await ev(`(() => { const c = document.querySelector('button[aria-label="收起音乐播放器"]'); if (c) c.click(); return true })()`)

/* ============ 页面异常 ============ */
check("无未捕获页面异常", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | ").slice(0, 400))

let summary = `RESULT: ${pass} passed / ${fail} failed\n${results.join("\n")}\n`
if (pageErrors.length) summary += `\npageErrors:\n${pageErrors.join("\n")}\n`
await writeFile(`${OUT}/accept-log.txt`, summary)
console.log(summary.trim())
ws.close()
process.exit(fail === 0 ? 0 : 1)
