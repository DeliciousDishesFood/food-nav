// task-21 · 本地验收脚本（pages dev 127.0.0.1:8788，本地 D1 已跑 migration 006）
// 覆盖：DTO skipCheck 字段 / 单站豁免跳过 / 全量候选排除豁免站 / 新站单站检测 active /
//       表单写回 skipCheck 往返 / 新建站默认不豁免
// 用法：npx wrangler pages dev dist --port 8788 后 → node dev-docs/reports/task-21/t21-local.mjs
// 输出：dev-docs/reports/task-21/local-checks.txt
import { readFile, writeFile } from 'node:fs/promises'

const ROOT = 'E:/react/food-nav'
const BASE = 'http://127.0.0.1:8788'
const OUT = `${ROOT}/dev-docs/reports/task-21/local-checks.txt`

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

async function allSites() {
  const { body } = await call('/api/sites?status=all')
  return (body && body.data) || []
}
const counts = (list) => {
  const c = { active: 0, checking: 0, broken: 0 }
  for (const s of list) c[s.status] = (c[s.status] || 0) + 1
  return c
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
  say(`[login] ok (token len=${token.length})`)
}

/* ---------- 1. DTO：skipCheck 字段 + 迁移结果 ---------- */
const before = await allSites()
say(`\n[snapshot] total=${before.length} ${JSON.stringify(counts(before))}`)
{
  const tinrry = before.find((s) => s.id === 8)
  const gone9 = before.find((s) => s.id === 9)
  const gone10 = before.find((s) => s.id === 10)
  const meishi = before.find((s) => s.id === 29)
  const haodou = before.find((s) => s.id === 30)
  check('1. tinrry(8) 在库且 active + skipCheck=true + failCount=0',
    Boolean(tinrry) && tinrry.status === 'active' && tinrry.skipCheck === true && tinrry.failCount === 0,
    JSON.stringify(tinrry))
  check('1. id 9/10 已删除', !gone9 && !gone10, JSON.stringify([gone9?.id, gone10?.id]))
  check('1. 29 美食天下已插入', Boolean(meishi) && meishi.name === '美食天下' && meishi.url === 'https://www.meishichina.com/' && meishi.status === 'active' && meishi.skipCheck === false, JSON.stringify(meishi))
  check('1. 30 好豆网已插入', Boolean(haodou) && haodou.name === '好豆网' && haodou.url === 'https://www.haodou.com/' && haodou.status === 'active' && haodou.skipCheck === false, JSON.stringify(haodou))
  check('1. 新站未自动打标（tag 空）', meishi?.tag === '' && haodou?.tag === '', JSON.stringify([meishi?.tag, haodou?.tag]))
  check('1. 所有站点 DTO 都带 skipCheck 布尔字段', before.every((s) => typeof s.skipCheck === 'boolean'),
    JSON.stringify(before.filter((s) => typeof s.skipCheck !== 'boolean').slice(0, 3)))
}

/* ---------- 2. 单站检测：豁免站跳过 ---------- */
{
  const { status, body } = await call('/api/check/run', {
    method: 'POST',
    body: JSON.stringify({ siteId: 8 }),
  })
  check('2. 单站检测 tinrry(8) → skipped:true',
    status === 200 && body?.ok === true && body?.data?.skipped === true && JSON.stringify(body.data.skippedIds) === '[8]' && body.data.total === 0,
    `HTTP ${status} ${JSON.stringify(body)}`)
  say(`       ${JSON.stringify(body && body.data)}`)
}

/* ---------- 3. 单站检测：新站 active ---------- */
for (const [id, label] of [[29, '美食天下'], [30, '好豆网']]) {
  const { status, body } = await call('/api/check/run', {
    method: 'POST',
    body: JSON.stringify({ siteId: id }),
  })
  const r = body?.ok ? body.data.results?.[0] : null
  check(`3. 单站检测 ${label}(${id}) → active`,
    status === 200 && r?.status === 'active',
    r ? JSON.stringify(r) : `HTTP ${status} ${JSON.stringify(body)}`)
  if (r) say(`       code=${r.statusCode} ${r.note} ${r.durationMs}ms`)
}

/* ---------- 4. 全量检测：候选排除豁免站 ---------- */
{
  const { status, body } = await call('/api/check/run', {
    method: 'POST',
    body: JSON.stringify({ batch: 4 }),
  })
  const data = body?.data
  const expected = before.filter((s) => s.skipCheck !== true).length
  check('4. 全量候选数 = 非豁免站数（豁免站被排除）',
    status === 200 && data?.total === expected,
    `HTTP ${status} total=${data?.total} expected=${expected}`)
  check('4. 本轮结果不含豁免站 id 8',
    Array.isArray(data?.results) && !data.results.some((r) => r.id === 8),
    JSON.stringify((data?.results || []).map((r) => r.id)))
  say(`       checked=${data?.checked} total=${data?.total} remaining=${data?.remaining} active=${data?.active} checking=${data?.checking} broken=${data?.broken}`)
}

/* ---------- 5. 写回往返：skipCheck 可改可还原 ---------- */
{
  const off = await call('/api/sites/8', { method: 'PUT', body: JSON.stringify({ skipCheck: false }) })
  check('5. PUT skipCheck=false → DTO skipCheck=false',
    off.status === 200 && off.body?.ok === true && off.body?.data?.skipCheck === false,
    JSON.stringify(off.body))
  const on = await call('/api/sites/8', { method: 'PUT', body: JSON.stringify({ skipCheck: true }) })
  check('5. PUT skipCheck=true 还原 → DTO skipCheck=true',
    on.status === 200 && on.body?.ok === true && on.body?.data?.skipCheck === true,
    JSON.stringify(on.body))
}

/* ---------- 6. 新建站默认不豁免 ---------- */
{
  const created = await call('/api/sites', {
    method: 'POST',
    body: JSON.stringify({
      name: 'T21临时站',
      desc: '本地验收临时站点，验收后删除',
      url: 'https://www.meishij.net/',
      icon: 'soup',
      coverImg: '/covers/noodle.svg',
      tag: '',
      sortOrder: 99,
      categoryId: 1,
    }),
  })
  const site = created.body?.data
  check('6. 新建站（未传 skipCheck）→ skipCheck=false',
    created.status === 201 && site?.skipCheck === false,
    `HTTP ${created.status} ${JSON.stringify(created.body)}`)
  if (site?.id) {
    const removed = await call(`/api/sites/${site.id}`, { method: 'DELETE' })
    check('6. 临时站已删除（清理）', removed.status === 200 && removed.body?.ok === true, JSON.stringify(removed.body))
  } else {
    check('6. 临时站已删除（清理）', false, '创建失败，无 id 可删')
  }
}

/* ---------- 7. 显示策略不变 ---------- */
{
  const { body } = await call('/api/sites')
  const list = (body && body.data) || []
  const bad = list.filter((s) => s.status !== 'active')
  check(`7. GET /api/sites（默认）只回 active（${list.length} 条）`, list.length > 0 && bad.length === 0, JSON.stringify(bad.slice(0, 3)))
}

const after = await allSites()
say(`\n[snapshot.after] total=${after.length} ${JSON.stringify(counts(after))}`)
const summaryLine = `RESULT: ${pass} passed / ${fail} failed`
say(`\n${summaryLine}`)
await writeFile(
  OUT,
  `# task-21 · 本地验收日志 · ${new Date().toISOString()}\n# pages dev ${BASE}（本地 D1 已执行 migration 006）\n\n${lines.join('\n')}\n`,
  'utf8',
)
console.log(`written: ${OUT}`)
process.exit(fail > 0 ? 1 : 0)
