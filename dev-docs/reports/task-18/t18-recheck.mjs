// task-18 · 线上单站复检（复活/判死的最小触发单元）
// 用法：node dev-docs/reports/task-18/t18-recheck.mjs 16 19
import { readFile } from 'node:fs/promises'

const ROOT = 'E:/react/food-nav'
const BASE = 'https://food-nav.shiora.cc'
const ids = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0)
if (!ids.length) {
  console.error('用法: node t18-recheck.mjs <siteId...>')
  process.exit(1)
}
const raw = await readFile(`${ROOT}/.dev.vars`, 'utf8')
const ADMIN_PASSWORD = (raw.match(/^ADMIN_PASSWORD\s*=\s*"?(.+?)"?\s*$/m) || [])[1]
if (!ADMIN_PASSWORD) {
  console.error('FATAL: .dev.vars 缺少 ADMIN_PASSWORD')
  process.exit(1)
}
const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: ADMIN_PASSWORD }),
})
const lj = await login.json()
if (!lj.ok) {
  console.error('FATAL: 登录失败', JSON.stringify(lj))
  process.exit(1)
}
const headers = {
  'content-type': 'application/json',
  authorization: `Bearer ${lj.data.token}`,
}
for (const siteId of ids) {
  const res = await fetch(`${BASE}/api/check/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ siteId }),
  })
  const body = await res.json()
  const r = body.ok && body.data.results[0]
  if (r) {
    console.log(`#${r.id} ${r.name} -> ${r.status} code=${r.statusCode} ok=${r.ok} ${r.durationMs}ms`)
    console.log(`    note=${r.note}`)
  } else {
    console.log(`#${siteId} FAIL HTTP ${res.status} ${JSON.stringify(body)}`)
  }
}
