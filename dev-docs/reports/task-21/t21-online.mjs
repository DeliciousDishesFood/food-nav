// task-21 · 线上验收（HTTP + admin API，部署 migration 006 / cron / pages 之后）
// 覆盖：探针 · 27 站全 active · tinrry 豁免 · 新站 29/30 在库 · 9/10 已删 ·
//       单站豁免跳过 · 新站单站检测 active · 全量候选排除豁免站 · 主站默认只回 active
// 用法：node dev-docs/reports/task-21/t21-online.mjs
// 输出：dev-docs/reports/task-21/online-checks.txt
import { readFile, writeFile } from 'node:fs/promises'

const ROOT = 'E:/react/food-nav'
const BASE = 'https://food-nav.shiora.cc'
const OUT = `${ROOT}/dev-docs/reports/task-21/online-checks.txt`

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
const sites = async (status) => ((await call(`/api/sites?status=${status}`)).body || {}).data || []
const counts = (list) => {
  const c = { active: 0, checking: 0, broken: 0 }
  for (const s of list) c[s.status] = (c[s.status] || 0) + 1
  return c
}

/* ---------- 0. 探针 ---------- */
say('[0] 探针')
for (const path of ['/', '/api/health', '/ask', '/api/sites?status=active']) {
  const res = await fetch(`${BASE}${path}`).catch(() => null)
  let extra = ''
  if (path === '/api/health' && res) extra = ` ${(await res.text().catch(() => '')) || ''}`.trim()
  check(`0. GET ${path} → 200`, Boolean(res) && res.status === 200, `status=${res && res.status}${extra}`)
}

/* ---------- 1. 站点集合：27 站全 active，无 9/10，新站 29/30 在库 ---------- */
const activeList = await sites('active')
const allList = await sites('all')
say(`\n[1] sites snapshot · active=${activeList.length} all=${allList.length} ${JSON.stringify(counts(allList))}`)
check('1. /api/sites?status=active → 27 条', activeList.length === 27, String(activeList.length))
check('1. /api/sites?status=all → 27 条', allList.length === 27, String(allList.length))
check('1. all 中 0 broken / 0 checking', counts(allList).broken === 0 && counts(allList).checking === 0, JSON.stringify(counts(allList)))
const tinrry = allList.find((s) => s.id === 8)
check('1. tinrry(8) active + skipCheck=true + failCount=0',
  Boolean(tinrry) && tinrry.status === 'active' && tinrry.skipCheck === true && tinrry.failCount === 0,
  JSON.stringify(tinrry))
check('1. id 9/10 已删除', !allList.some((s) => s.id === 9 || s.id === 10), JSON.stringify(allList.filter((s) => s.id === 9 || s.id === 10)))
const meishi = allList.find((s) => s.id === 29)
const haodou = allList.find((s) => s.id === 30)
check('1. 29 美食天下 active + 描述正确 + 无角标',
  Boolean(meishi) && meishi.name === '美食天下' && meishi.url === 'https://www.meishichina.com/' && meishi.status === 'active' && meishi.tag === '' && /菜谱/.test(meishi.desc || ''),
  JSON.stringify(meishi))
check('1. 30 好豆网 active + 描述正确 + 无角标',
  Boolean(haodou) && haodou.name === '好豆网' && haodou.url === 'https://www.haodou.com/' && haodou.status === 'active' && haodou.tag === '' && /菜谱/.test(haodou.desc || ''),
  JSON.stringify(haodou))
check('1. 所有站点都带 skipCheck 布尔字段', allList.every((s) => typeof s.skipCheck === 'boolean'),
  JSON.stringify(allList.filter((s) => typeof s.skipCheck !== 'boolean')))

/* ---------- 2. 登录 ---------- */
{
  const { status, body } = await call('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  })
  check('2. admin 登录', status === 200 && body?.ok === true, `HTTP ${status}`)
  token = body?.data?.token || null
}

/* ---------- 3. 单站检测：豁免站跳过（不写状态、不写日志） ---------- */
{
  const beforeCheckedAt = tinrry?.lastCheckedAt || null
  const { status, body } = await call('/api/check/run', {
    method: 'POST',
    body: JSON.stringify({ siteId: 8 }),
  })
  const data = body?.data
  check('3. 单站检测 tinrry(8) → skipped:true + skippedIds=[8] + total=0',
    status === 200 && body?.ok === true && data?.skipped === true && JSON.stringify(data.skippedIds) === '[8]' && data.total === 0,
    `HTTP ${status} ${JSON.stringify(body)}`)
  say(`       ${JSON.stringify(data)}`)
  const after = (await sites('all')).find((s) => s.id === 8)
  check('3. 跳过后 tinrry 状态未被改写（active / lastCheckedAt 不变）',
    Boolean(after) && after.status === 'active' && after.failCount === 0 && (after.lastCheckedAt || null) === beforeCheckedAt,
    `before=${beforeCheckedAt} after=${after?.lastCheckedAt}`)
}

/* ---------- 4. 单站检测：新站 active（线上边缘实测） ---------- */
for (const [id, label] of [[29, '美食天下'], [30, '好豆网']]) {
  const { status, body } = await call('/api/check/run', {
    method: 'POST',
    body: JSON.stringify({ siteId: id }),
  })
  const r = body?.ok ? body.data?.results?.[0] : null
  check(`4. 单站检测 ${label}(${id}) → active`, status === 200 && r?.status === 'active',
    r ? JSON.stringify(r) : `HTTP ${status} ${JSON.stringify(body)}`)
  if (r) say(`       code=${r.statusCode} ${r.note} ${r.durationMs}ms`)
}

/* ---------- 5. 全量检测：豁免站不进候选（多轮到 remaining=0） ---------- */
say('\n[5] 全量检测（since 循环）')
{
  const since = Date.now()
  const checkedIds = new Set()
  let last = null
  let firstTotal = null
  const totals = []
  let rounds = 0
  for (; rounds < 12; rounds += 1) {
    const { status, body } = await call('/api/check/run', { method: 'POST', body: JSON.stringify({ batch: 4, since }) })
    if (status !== 200 || !body?.ok) {
      check('5. 全量调用成功', false, `HTTP ${status} ${JSON.stringify(body)}`)
      break
    }
    last = body.data
    if (firstTotal === null) firstTotal = body.data.total
    totals.push(body.data.total)
    for (const r of body.data.results) checkedIds.add(r.id)
    say(`  round ${rounds + 1}: checked=${body.data.checked} total=${body.data.total} remaining=${body.data.remaining} active=${body.data.active} checking=${body.data.checking} broken=${body.data.broken}`)
    if (body.data.remaining === 0) break
  }
  if (last) {
    check('5. 首轮全量 total = 26（27 站 - 1 豁免站）', firstTotal === 26, String(firstTotal))
    check('5. 每轮 total ≤ 26（豁免站从不入候选）', totals.every((t) => t <= 26), JSON.stringify(totals))
    check('5. 豁免站 id 8 从未进候选/结果', !checkedIds.has(8), [...checkedIds].join(','))
    check('5. 新站 29/30 进入候选被检测', checkedIds.has(29) && checkedIds.has(30), [...checkedIds].join(','))
    check('5. 全量跑完 remaining=0', last.remaining === 0, String(last.remaining))
  }
}

/* ---------- 6. 稳定化：把偶发 checking 补检回 active，确保 27 站全 active ---------- */
say('\n[6] 稳定化补检')
for (let round = 0; round < 4; round += 1) {
  const list = await sites('all')
  const bad = list.filter((s) => s.status !== 'active')
  if (!bad.length) break
  say(`  补检 ${bad.map((s) => s.id).join(',')} (${bad.map((s) => s.status).join(',')})`)
  for (const s of bad) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { body } = await call('/api/check/run', { method: 'POST', body: JSON.stringify({ siteId: s.id }) })
      const r = body?.ok ? body.data?.results?.[0] : null
      say(`    site ${s.id} attempt ${attempt + 1} → ${r?.status ?? 'n/a'} code=${r?.statusCode ?? '-'} ${r?.note ?? ''}`)
      if (r?.status === 'active') break
      await new Promise((resolve) => setTimeout(resolve, 8000))
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 3000))
}
const finalAll = await sites('all')
const finalActive = await sites('active')
check('6. 稳定化后 27 站全 active', finalAll.length === 27 && counts(finalAll).active === 27, `${finalAll.length} ${JSON.stringify(counts(finalAll))}`)
check('6. 主站默认接口回 27 条', finalActive.length === 27, String(finalActive.length))
check('6. 豁免站仍 active + skipCheck=true',
  Boolean(finalAll.find((s) => s.id === 8)) && finalAll.find((s) => s.id === 8).status === 'active' && finalAll.find((s) => s.id === 8).skipCheck === true,
  JSON.stringify(finalAll.find((s) => s.id === 8)))

const summaryLine = `RESULT: ${pass} passed / ${fail} failed`
say(`\n${summaryLine}`)
await writeFile(
  OUT,
  `# task-21 · 线上验收日志 · ${new Date().toISOString()}\n# ${BASE} · migration 006 + cron + pages 已部署\n\n${lines.join('\n')}\n`,
  'utf8',
)
console.log(`written: ${OUT}`)
process.exit(fail > 0 ? 1 : 0)
