// task-18 · M9-T2 链接检测分级单测（纯函数，不依赖 D1 / 网络）
// 覆盖：403→active / 404→increment(2次判死) / 503→active /
//       超时→checking→broken / DNS·TLS→broken / 429→keep
// 附加：pickTargets 候选含 broken（复活机制）· SUSPICIOUS 常量已清除 · broken 复活
// 用法：node dev-docs/reports/task-18/t18-grade.mjs
import { readFile, writeFile } from 'node:fs/promises'
import {
  BREAK_AFTER_FAILS,
  gradeResult,
  nextSiteState,
  pickTargets,
} from '../../../functions/api/_lib/checker.js'

const results = []
let pass = 0
let fail = 0
function check(name, cond, extra = '') {
  const line = cond ? `  ok  ${name}` : `  FAIL ${name}${extra ? ` -> ${extra}` : ''}`
  if (cond) pass += 1
  else fail += 1
  results.push(line)
  console.log(line)
}

/* ---------- 1. 403 → active（反爬不等于死链），fail_count 清零 ---------- */
{
  const next = nextSiteState({ status: 'broken', fail_count: 3 }, { statusCode: 403, note: 'HTTP 403' })
  check('1. 403 → status active', next.status === 'active', JSON.stringify(next))
  check('1. 403 → fail_count 清零', next.failCount === 0, String(next.failCount))
  check('1. 403 → logOk=1（写日志为成功）', next.verdict.logOk === 1, String(next.verdict.logOk))
  check('1. 403 note 标注反爬可达', next.verdict.note.includes('反爬拦截但站点可达'), next.verdict.note)
}

/* ---------- 2. 404 → increment，连续 2 次判死 ---------- */
{
  const first = nextSiteState({ status: 'active', fail_count: 0 }, { statusCode: 404, note: 'HTTP 404' })
  check('2. 404 第一次 → fail_count=1 且仍 active', first.failCount === 1 && first.status === 'active', JSON.stringify(first))
  const second = nextSiteState({ status: 'active', fail_count: first.failCount }, { statusCode: 404, note: 'HTTP 404' })
  check('2. 404 第二次 → fail_count=2 且 broken', second.failCount === 2 && second.status === 'broken', JSON.stringify(second))
  check('2. 404 note 标注页面已消失', second.verdict.note.includes('页面已消失'), second.verdict.note)
  check(`2. 判死阈值 = ${BREAK_AFTER_FAILS}`, BREAK_AFTER_FAILS === 2, String(BREAK_AFTER_FAILS))
  const instant = nextSiteState({ status: 'checking', fail_count: 1 }, { statusCode: 410, note: 'HTTP 410' })
  check('2. 410（fail_count 已 1）→ 立即 broken', instant.status === 'broken', JSON.stringify(instant))
}

/* ---------- 3. 普通 5xx → active（有响应 = 可达）---------- */
{
  const next = nextSiteState({ status: 'checking', fail_count: 2 }, { statusCode: 503, note: 'HTTP 503' })
  check('3. 503 → status active', next.status === 'active', JSON.stringify(next))
  check('3. 503 → fail_count 清零', next.failCount === 0, String(next.failCount))
  check('3. 503 note 标注服务降级但可达', next.verdict.note.includes('服务降级但站点可达'), next.verdict.note)
  const plain5xx = nextSiteState({ status: 'active', fail_count: 1 }, { statusCode: 502, note: 'HTTP 502' })
  check('3. 502 → active 清零', plain5xx.status === 'active' && plain5xx.failCount === 0, JSON.stringify(plain5xx))
}

/* ---------- 3b. Cloudflare 边缘码 520-527/530 → 网络层失败（源站不可达） ---------- */
{
  for (const code of [526, 530]) {
    const first = nextSiteState({ status: 'active', fail_count: 0 }, { statusCode: code, note: `HTTP ${code}` })
    check(`3b. ${code} 第一次 → fail=1 且 checking`, first.failCount === 1 && first.status === 'checking', JSON.stringify(first))
    check(`3b. ${code} note 标注源站不可达`, first.verdict.note.includes('源站不可达'), first.verdict.note)
    const second = nextSiteState({ status: 'checking', fail_count: first.failCount }, { statusCode: code, note: `HTTP ${code}` })
    check(`3b. ${code} 第二次 → fail=2 且 broken`, second.failCount === 2 && second.status === 'broken', JSON.stringify(second))
  }
  const edgeRecover = nextSiteState({ status: 'broken', fail_count: 3 }, { statusCode: 200, note: 'HTTP 200' })
  check('3b. 边缘错误站恢复 200 → 复活 active', edgeRecover.status === 'active' && edgeRecover.failCount === 0, JSON.stringify(edgeRecover))
}

/* ---------- 4. statusCode=0 + 超时 → checking → 连续 2 次 broken ---------- */
{
  const timedOut = { statusCode: 0, timedOut: true, note: 'timeout 5000ms' }
  const verdict = gradeResult(timedOut)
  check('4. 超时 → failMode=increment 且首败 checking', verdict.failMode === 'increment' && verdict.status === 'checking', JSON.stringify(verdict))
  const first = nextSiteState({ status: 'active', fail_count: 0 }, timedOut)
  check('4. 超时第一次 → fail_count=1 且 checking', first.failCount === 1 && first.status === 'checking', JSON.stringify(first))
  const second = nextSiteState({ status: 'checking', fail_count: first.failCount }, timedOut)
  check('4. 超时第二次 → fail_count=2 且 broken', second.failCount === 2 && second.status === 'broken', JSON.stringify(second))
  check('4. 超时 note 保留 timeout 证据', second.verdict.note.includes('timeout 5000ms'), second.verdict.note)
}

/* ---------- 5. statusCode=0 + DNS/TLS 错误 → 同上判死 ---------- */
{
  const dnsErr = {
    statusCode: 0,
    timedOut: false,
    note: 'network error: getaddrinfo ENOTFOUND dessertlab.cn',
  }
  const first = nextSiteState({ status: 'active', fail_count: 0 }, dnsErr)
  check('5. DNS 错误第一次 → fail_count=1 且 checking', first.failCount === 1 && first.status === 'checking', JSON.stringify(first))
  const second = nextSiteState({ status: 'checking', fail_count: first.failCount }, dnsErr)
  check('5. DNS 错误第二次 → broken', second.status === 'broken', JSON.stringify(second))
  const tlsErr = { statusCode: 0, timedOut: false, note: 'network error: certificate has expired' }
  const tlsSecond = nextSiteState({ status: 'checking', fail_count: 1 }, tlsErr)
  check('5. TLS 证书错误第二次 → broken', tlsSecond.status === 'broken', JSON.stringify(tlsSecond))
  check('5. 网络层 note 标注不可达', first.verdict.note.includes('网络层不可达'), first.verdict.note)
}

/* ---------- 6. 429 → keep（状态与 fail_count 均不变） ---------- */
{
  const limited = { statusCode: 429, note: 'HTTP 429' }
  const activeCase = nextSiteState({ status: 'active', fail_count: 1 }, limited)
  check('6. 429(active, fail=1) → 状态与计数不变', activeCase.status === 'active' && activeCase.failCount === 1, JSON.stringify(activeCase))
  const checkingCase = nextSiteState({ status: 'checking', fail_count: 2 }, limited)
  check('6. 429(checking, fail=2) → 不被误判 broken', checkingCase.status === 'checking' && checkingCase.failCount === 2, JSON.stringify(checkingCase))
  const brokenCase = nextSiteState({ status: 'broken', fail_count: 3 }, limited)
  check('6. 429(broken) → 维持 broken', brokenCase.status === 'broken' && brokenCase.failCount === 3, JSON.stringify(brokenCase))
  check('6. 429 logOk=1 且 note 标注限流', activeCase.verdict.logOk === 1 && activeCase.verdict.note.includes('限流'), activeCase.verdict.note)
}

/* ---------- 附加 A：2xx/3xx 与其余 4xx 归一为可达 ---------- */
{
  for (const code of [200, 206, 301, 302, 401, 406, 418, 999]) {
    const next = nextSiteState({ status: 'broken', fail_count: 3 }, { statusCode: code, note: `HTTP ${code}` })
    check(`A. HTTP ${code} → active 且清零`, next.status === 'active' && next.failCount === 0, JSON.stringify(next))
  }
}

/* ---------- 附加 B：broken 自动复活（恢复有响应 → active） ---------- */
{
  const revived = nextSiteState({ status: 'broken', fail_count: 4 }, { statusCode: 200, note: 'HTTP 200' })
  check('B. broken 站 200 → 复活 active 且 fail_count=0', revived.status === 'active' && revived.failCount === 0, JSON.stringify(revived))
}

/* ---------- 附加 C：pickTargets 候选含 broken（复活机制 SQL） ---------- */
function mockDb(rows = []) {
  const statements = []
  return {
    statements,
    prepare(sql) {
      const stmt = {
        sql,
        args: [],
        bind(...args) {
          stmt.args = args
          return stmt
        },
        async all() {
          return { results: rows }
        },
      }
      statements.push(stmt)
      return stmt
    },
  }
}
{
  const db = mockDb([{ id: 9, name: 'dessertlab', url: 'https://dessertlab.cn/', status: 'broken', fail_count: 3 }])
  await pickTargets(db, null, null)
  const sql = db.statements[0] ? db.statements[0].sql : ''
  check('C. 默认全量路径候选含 broken', /status IN \('active', 'checking', 'broken'\)/.test(sql), sql.replace(/\s+/g, ' '))

  const db2 = mockDb([])
  await pickTargets(db2, null, '2026-10-07 00:00:00.000')
  const sql2 = db2.statements[0] ? db2.statements[0].sql : ''
  check('C. since 路径（cron/手动全量）候选含 broken', /status IN \('active', 'checking', 'broken'\)/.test(sql2), sql2.replace(/\s+/g, ' '))
  check('C. since 路径仍按 last_checked_at 最久优先', /ORDER BY \(last_checked_at IS NULL\) DESC, last_checked_at ASC/.test(sql2), '')

  const db3 = mockDb([{ id: 2, name: 'douguo', url: 'https://www.douguo.com/', status: 'active', fail_count: 0 }])
  const rows = await pickTargets(db3, [2], null)
  const sql3 = db3.statements[0] ? db3.statements[0].sql : ''
  check('C. 单站路径不过滤 status', !/status IN/.test(sql3) && rows.length === 1, sql3.replace(/\s+/g, ' '))
}

/* ---------- 附加 D：可疑档常量/代码已彻底移除（防 oxlint 未用变量） ---------- */
{
  const source = await readFile(
    new URL('../../../functions/api/_lib/checker.js', import.meta.url),
    'utf8',
  )
  check('D. checker.js 已无 SUSPICIOUS 字样', !source.includes('SUSPICIOUS'), '')
  check('D. checker.js 已无 isSuspiciousCode', !source.includes('isSuspiciousCode'), '')
  const mod = await import('../../../functions/api/_lib/checker.js')
  check('D. SUSPICIOUS_BREAK_AFTER 导出已删除', mod.SUSPICIOUS_BREAK_AFTER === undefined, String(mod.SUSPICIOUS_BREAK_AFTER))
  check('D. 仍导出 gradeResult / nextSiteState / pickTargets', typeof mod.gradeResult === 'function' && typeof mod.nextSiteState === 'function' && typeof mod.pickTargets === 'function', '')
}

const summaryLine = `RESULT: ${pass} passed / ${fail} failed`
console.log(`\n${summaryLine}`)
results.push('', summaryLine)
await writeFile(
  new URL('./grade-test-log.txt', import.meta.url),
  `# task-18 · M9-T2 分级单测日志 · ${new Date().toISOString()}\n# 覆盖 403/404/503/超时/DNS-TLS/429 六组 + pickTargets 复活候选 + SUSPICIOUS 清除\n\n${results.join('\n')}\n`,
  'utf8',
)
process.exit(fail > 0 ? 1 : 0)
