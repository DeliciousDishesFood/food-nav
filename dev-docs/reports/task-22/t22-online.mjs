import { readFileSync } from 'node:fs'

const BASE = 'https://food-nav.shiora.cc'
const vars = readFileSync('E:/react/food-nav/functions/.dev.vars', 'utf8')
const password = vars.match(/^ADMIN_PASSWORD=(.*)$/m)[1].trim()

const login = await fetch(BASE + '/api/admin/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password }),
}).then((r) => r.json())
if (!login.ok) {
  console.log('LOGIN_FAIL', JSON.stringify(login))
  process.exit(1)
}
const token = login.data.token

const sites = await fetch(BASE + '/api/sites?status=active').then((r) => r.json())
console.log(
  'active=' + sites.data.length + ' skip=[' + sites.data.filter((s) => s.skipCheck).map((s) => s.id).join(',') + ']',
)

const since = Date.now()
let remaining = 99
let round = 0
while (remaining > 0 && round < 8) {
  round++
  const res = await fetch(BASE + '/api/check/run', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ since, batch: 4, maxSites: 10 }),
  })
  const body = await res.json()
  if (!body.ok) {
    console.log('FAIL', res.status, JSON.stringify(body))
    process.exit(1)
  }
  remaining = body.data.remaining
  console.log(
    'round ' + round + ' checked=' + body.data.checked + ' remaining=' + remaining +
      ' active=' + body.data.active + ' broken=' + body.data.broken +
      ' checking=' + body.data.checking + ' errors=' + body.data.errors +
      ' elapsedMs=' + body.data.elapsedMs,
  )
}
console.log(remaining === 0 ? 'ONLINE_FULL_RUN_OK rounds=' + round : 'ONLINE_INCOMPLETE remaining=' + remaining)

const again = await fetch(BASE + '/api/check/run', {
  method: 'POST',
  headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
  body: JSON.stringify({ siteId: 1 }),
})
const againBody = await again.json()
console.log(
  'post-release single-site: ' + again.status + ' ok=' + againBody.ok + ' checked=' +
    (againBody.data && againBody.data.checked),
)
process.exit(remaining === 0 && againBody.ok ? 0 : 1)
