// task-18 · 线上全量分级验收（部署后跑一次线上检测，验证复活机制 + 主站恢复）
// 用法：node dev-docs/reports/task-18/t18-online.mjs
// 输出：dev-docs/reports/task-18/online-checks.txt
import { readFile, writeFile } from 'node:fs/promises'

const ROOT = 'E:/react/food-nav'
const BASE = 'https://food-nav.shiora.cc'
const OUT = `${ROOT}/dev-docs/reports/task-18/online-checks.txt`

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

let token = null
async function call(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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
  say(`[login] ok · ${BASE}`)
}

async function allSites() {
  const { body } = await call('/api/sites?status=all')
  return (body && body.data) || []
}
function counts(list) {
  const c = { active: 0, checking: 0, broken: 0 }
  for (const s of list) c[s.status] = (c[s.status] || 0) + 1
  return c
}
function find(list, re) {
  return list.find((s) => re.test(`${s.name || ''} ${s.url || ''}`))
}

const beforeList = await allSites()
const beforeMap = Object.fromEntries(beforeList.map((s) => [s.id, s.status]))
say(`[snapshot.before] total=${beforeList.length} ${JSON.stringify(counts(beforeList))}`)
for (const s of beforeList.filter((x) => x.status !== 'active')) {
  say(`  broken 前置: #${s.id} ${s.name} ${s.url}`)
}

/* ---------- 线上全量检测：2 个 pass（网络层/边缘码首败→checking，第二次才判死） ---------- */
const checkedIds = new Set()
const roundRows = []
let lastSummary = null
for (let pass = 1; pass <= 2; pass += 1) {
  say(`\n[run] pass ${pass} · POST /api/check/run 全量（batch=4, since 循环）`)
  const since = Date.now()
  for (let round = 0; round < 12; round += 1) {
    const { status, body } = await call('/api/check/run', {
      method: 'POST',
      body: JSON.stringify({ batch: 4, since }),
    })
    if (status !== 200 || !body?.ok) {
      check(`pass ${pass} 全量检测调用成功`, false, `HTTP ${status} ${JSON.stringify(body)}`)
      break
    }
    const s = body.data
    lastSummary = s
    for (const r of s.results) checkedIds.add(r.id)
    const row = `  pass ${pass} round ${round + 1}: checked=${s.checked} total=${s.total} remaining=${s.remaining} active=${s.active} broken=${s.broken} checking=${s.checking} elapsed=${s.elapsedMs}ms`
    roundRows.push(row)
    say(row)
    if (s.remaining === 0) break
  }
  const snap = await allSites()
  say(`  pass ${pass} 后快照: ${JSON.stringify(counts(snap))}`)
}

/* ---------- 验收断言 ---------- */
say('\n[assert]')
if (lastSummary) check('全量跑完 remaining=0', lastSummary.remaining === 0, String(lastSummary.remaining))

// 稳定化：瞬时超时会把可达站打到 checking/broken，补检 1 次即可复活
// （3 个真死链 #8/#9/#10 不补检——它们按分级规则应保持 broken）
const BASELINE_DEAD = [8, 9, 10]
let afterList = await allSites()
for (const s of afterList.filter((x) => x.status !== 'active' && !BASELINE_DEAD.includes(x.id))) {
  say(`[stabilise] 补检 #${s.id} ${s.name}（当前 ${s.status}）`)
  const res = await call('/api/check/run', { method: 'POST', body: JSON.stringify({ siteId: s.id }) })
  const r = res.body && res.body.ok && res.body.data.results[0]
  say(r ? `  -> ${r.status} code=${r.statusCode} ${r.durationMs}ms ${r.note}` : `  -> FAIL ${JSON.stringify(res.body)}`)
}
afterList = await allSites()
const afterCounts = counts(afterList)
say(`[snapshot.after] total=${afterList.length} ${JSON.stringify(afterCounts)}（期望 active=24 / broken=3 / checking=0）`)

const douguo = find(afterList, /douguo/i)
const bilibili = find(afterList, /bilibili|哔哩|b站/i)
const tinrry = find(afterList, /tinrry/i)
const dessertlab = find(afterList, /dessertlab/i)
const icecream = find(afterList, /icecreamplanet/i)

check('豆果美食 → active（403 误判复活）', douguo?.status === 'active', JSON.stringify(douguo))
check('B站 → active（403 误判复活）', bilibili?.status === 'active', JSON.stringify(bilibili))
check('Tinrry 甜悦家 → 保持 broken（真死链）', tinrry?.status === 'broken', JSON.stringify(tinrry))
check('甜品实验室 → 保持 broken（真死链）', dessertlab?.status === 'broken', JSON.stringify(dessertlab))
check('冰淇淋星球 → 保持 broken（真死链）', icecream?.status === 'broken', JSON.stringify(icecream))

check(`线上 active = 24（实际 ${afterCounts.active}）`, afterCounts.active === 24, JSON.stringify(afterCounts))
check(`线上 broken = 3（实际 ${afterCounts.broken}，应为 3 个真死链）`, afterCounts.broken === 3, JSON.stringify(afterCounts))
check(`无 checking 残留（实际 ${afterCounts.checking}）`, afterCounts.checking === 0, JSON.stringify(afterCounts))

{
  const { body } = await call('/api/sites')
  const list = (body && body.data) || []
  const bad = list.filter((s) => s.status !== 'active')
  check(`主站 /api/sites 只回 active（${list.length} 条 == active 数 ${afterCounts.active}）`, list.length === 24 && bad.length === 0, `len=${list.length} active=${afterCounts.active} bad=${bad.length}`)
}

const changed = afterList
  .filter((s) => beforeMap[s.id] && beforeMap[s.id] !== s.status)
  .map((s) => `  #${s.id} ${s.name}: ${beforeMap[s.id]} → ${s.status}`)
if (changed.length) say(`[changed] ${changed.length} 站：\n${changed.join('\n')}`)

// 任务启动时的 5 个 broken（豆果/B站 误判 + 3 真死链）——必须全部进入候选被重测
const baselineBroken = [2, 6, 8, 9, 10]
const retestedBroken = baselineBroken.filter((id) => checkedIds.has(id))
check(`任务前 5 个 broken 站全部进入候选被重测（${retestedBroken.length}/5）`, retestedBroken.length === baselineBroken.length, `retested=${retestedBroken.join(',')}`)
say(`  被重测的原 broken 站 id: ${retestedBroken.join(', ')}`)

/* ---------- check_logs 证据 ---------- */
{
  const { status, body } = await call('/api/check/logs?limit=40')
  const rows = (body && body.data && body.data.list) || []
  say(`\n[check_logs] HTTP ${status} total=${body?.data?.total ?? '-'}，最近 20 条（倒序）`)
  for (const l of rows.slice(0, 20)) {
    say(`  ${l.checkedAt} #${l.siteId} ${l.siteName} ok=${l.ok} code=${l.statusCode} ${l.durationMs}ms note=${l.note}`)
  }
  const newNotes = rows.filter((l) => /反爬拦截但站点可达|服务降级但站点可达|网络层不可达|限流|页面已消失/.test(l.note || ''))
  check(`分级 note 已生效（${newNotes.length}/${rows.length} 条）`, newNotes.length > 0, '')
  const oldSuspicious = rows.filter((l) => (l.note || '').includes('可疑档'))
  check('日志中已无「可疑档」旧文案', oldSuspicious.length === 0, JSON.stringify(oldSuspicious.slice(0, 2)))
  await writeFile(
    `${ROOT}/dev-docs/reports/task-18/check-logs.txt`,
    `# task-18 · 线上 check_logs 证据 · ${new Date().toISOString()}\n# GET /api/check/logs?limit=40（Bearer）\n${(body && JSON.stringify(body, null, 2)) || 'null'}\n`,
    'utf8',
  )
  await writeFile(
    `${ROOT}/dev-docs/reports/task-18/sites-snapshot.json`,
    JSON.stringify({ before: beforeList, after: afterList, roundRows }, null, 2),
    'utf8',
  )
}

const summaryLine = `RESULT: ${pass} passed / ${fail} failed`
say(`\n${summaryLine}`)
await writeFile(
  OUT,
  `# task-18 · 线上全量分级验收日志 · ${new Date().toISOString()}\n# ${BASE} · 部署后手动触发全量检测\n\n${lines.join('\n')}\n`,
  'utf8',
)
console.log(`written: ${OUT}`)
process.exit(fail > 0 ? 1 : 0)
