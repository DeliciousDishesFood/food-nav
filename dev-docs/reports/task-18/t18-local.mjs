// task-18 · 本地验收脚本（pages dev 127.0.0.1:8788 + mock targets 8899）
// 覆盖：单站分级（403 复活 / 500 降级 / 超时 / 真死链）、全量候选含 broken、显示策略只回 active
// 用法：node dev-docs/reports/task-18/t18-local.mjs
// 输出：dev-docs/reports/task-18/local-checks.txt
import { readFile, writeFile } from 'node:fs/promises'

const ROOT = 'E:/react/food-nav'
const BASE = 'http://127.0.0.1:8788'
const OUT = `${ROOT}/dev-docs/reports/task-18/local-checks.txt`

const raw = await readFile(`${ROOT}/.dev.vars`, 'utf8')
const ADMIN_PASSWORD = (raw.match(/^ADMIN_PASSWORD\s*=\s*"?(.+?)"?\s*$/m) || [])[1]
if (!ADMIN_PASSWORD) {
  console.error('FATAL: .dev.vars 缺少 ADMIN_PASSWORD')
  process.exit(1)
}

const lines = []
let pass = 0
let fail = 0
function say(text) {
  console.log(text)
  lines.push(text)
}
function check(name, cond, extra = '') {
  const line = cond ? `  ok  ${name}` : `  FAIL ${name}${extra ? ` -> ${extra}` : ''}`
  if (cond) pass += 1
  else fail += 1
  say(line)
}

async function call(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, body }
}

let token = null
{
  const { status, body } = await call('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  })
  if (status !== 200 || !body?.ok) {
    console.error('FATAL: 登录失败', status, JSON.stringify(body))
    process.exit(1)
  }
  token = body.data.token
  say(`[login] ok (token len=${token.length})`)
}

async function allSites() {
  const { body } = await call('/api/sites?status=all')
  return (body && body.data) || []
}
function summarise(list) {
  const counts = { active: 0, checking: 0, broken: 0 }
  for (const s of list) counts[s.status] = (counts[s.status] || 0) + 1
  return counts
}

const beforeList = await allSites()
const before = Object.fromEntries(beforeList.map((s) => [s.id, s.status]))
const beforeCounts = summarise(beforeList)
say(`\n[snapshot.before] total=${beforeList.length} ${JSON.stringify(beforeCounts)}`)

/* ---------- 2. 单站检测分级 ---------- */
const singleCases = [
  { id: 2, expect: 'active', label: '豆果美食（真实 403 反爬 → 复活 active）' },
  { id: 71, expect: 'active', label: 'M3测试-403（mock 403 → broken 复活）' },
  { id: 74, expect: 'active', label: 'M3测试-500（mock 500 降级 → checking→active）' },
  { id: 75, expect: 'active', label: 'M3测试-302（重定向 → active）' },
  { id: 73, expect: 'active', label: 'M3测试-无HEAD（HEAD 405 回退 GET → active）' },
  { id: 8, expect: 'broken', label: 'Tinrry（TLS/DNS 真死 → 保持 broken）' },
  { id: 9, expect: 'broken', label: '甜品实验室（DNS 真死 → 保持 broken）' },
  { id: 72, expect: 'broken', label: 'M3测试-超时（mock /hang → 保持 broken）' },
]
say('\n[2] 单站分级检测')
for (const c of singleCases) {
  const { status, body } = await call('/api/check/run', {
    method: 'POST',
    body: JSON.stringify({ siteId: c.id }),
  })
  const r = body && body.ok ? body.data.results[0] : null
  const got = r ? r.status : `HTTP ${status}`
  check(
    `2. site ${c.id} ${c.label} → ${c.expect}`,
    got === c.expect,
    r ? JSON.stringify(r) : JSON.stringify(body),
  )
  if (r) say(`       code=${r.statusCode ?? '-'} note=${r.note}`)
}

/* ---------- 3. 全量检测：broken 必须在候选内（复活机制） ---------- */
say('\n[3] 全量检测（since 循环，候选含 broken）')
const since = Date.now()
const checkedIds = new Set()
let lastSummary = null
let round = 0
for (; round < 14; round += 1) {
  const { status, body } = await call('/api/check/run', {
    method: 'POST',
    body: JSON.stringify({ batch: 4, since }),
  })
  if (status !== 200 || !body?.ok) {
    check('3. 全量检测调用成功', false, `HTTP ${status} ${JSON.stringify(body)}`)
    break
  }
  lastSummary = body.data
  for (const r of body.data.results) checkedIds.add(r.id)
  say(
    `  round ${round + 1}: checked=${body.data.checked} total=${body.data.total} remaining=${body.data.remaining} active=${body.data.active} broken=${body.data.broken} checking=${body.data.checking}`,
  )
  if (body.data.remaining === 0) break
}
if (lastSummary) {
  check('3. 全量跑完 remaining=0', lastSummary.remaining === 0, String(lastSummary.remaining))
  const brokenBefore = beforeList.filter((s) => s.status === 'broken').map((s) => s.id)
  const revivedOrRetested = brokenBefore.filter((id) => checkedIds.has(id))
  check(
    `3. broken 站点进入候选被重测（${revivedOrRetested.length}/${brokenBefore.length}）`,
    revivedOrRetested.length > 0,
    `brokenBefore=${brokenBefore.join(',')} checked=${[...checkedIds].join(',')}`,
  )
  say(`       被重测的原 broken 站: ${revivedOrRetested.join(', ')}`)
}

/* ---------- 4. 显示策略：默认仍只回 active ---------- */
say('\n[4] 显示策略')
{
  const { body } = await call('/api/sites')
  const list = (body && body.data) || []
  const bad = list.filter((s) => s.status !== 'active')
  check(`4. GET /api/sites（默认）只回 active（${list.length} 条）`, list.length > 0 && bad.length === 0, JSON.stringify(bad.slice(0, 3)))
}

/* ---------- 快照 + 日志证据 ---------- */
const afterList = await allSites()
const afterCounts = summarise(afterList)
say(`\n[snapshot.after] total=${afterList.length} ${JSON.stringify(afterCounts)}`)
const changed = afterList
  .filter((s) => before[s.id] && before[s.id] !== s.status)
  .map((s) => `${s.id} ${s.name}: ${before[s.id]} → ${s.status}`)
if (changed.length) say(`[changed] ${changed.length} 站状态变化:\n    ${changed.join('\n    ')}`)
{
  const { status, body } = await call('/api/check/logs?limit=12')
  say(`\n[check_logs] HTTP ${status} total=${body?.data?.total ?? '-'}，最近 12 条`)
  const rows = (body && body.data && body.data.list) || []
  for (const l of rows) {
    say(`  ${l.checkedAt} site=${l.siteId} ${l.siteName} ok=${l.ok} code=${l.statusCode} ${l.durationMs}ms note=${l.note}`)
  }
  check('4. check_logs 可读且含分级 note', rows.length > 0 && rows.some((l) => /反爬拦截但站点可达|服务降级但站点可达|网络层不可达|限流|页面已消失/.test(l.note || '')), JSON.stringify(rows.slice(0, 3)))
}

const summaryLine = `RESULT: ${pass} passed / ${fail} failed`
say(`\n${summaryLine}`)
await writeFile(
  OUT,
  `# task-18 · 本地分级验收日志 · ${new Date().toISOString()}\n# pages dev ${BASE} + mock targets 127.0.0.1:8899\n\n${lines.join('\n')}\n`,
  'utf8',
)
console.log(`written: ${OUT}`)
process.exit(fail > 0 ? 1 : 0)
