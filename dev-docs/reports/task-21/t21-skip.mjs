// task-21 · M9-T3 检测豁免 + 死链治理 单测
// 覆盖：pickTargets 三条路径排除豁免站 / skippedSiteIds / DTO skipCheck / 校验归一 /
//       run.js 跳过语义 / migration 006 内容 / admin 前端开关与徽标 / 新站真实检测 active
// 用法：node dev-docs/reports/task-21/t21-skip.mjs
// 输出：dev-docs/reports/task-21/skip-test-log.txt
import { readFile, writeFile } from 'node:fs/promises'
import { checkOne, nextSiteState, pickTargets, skippedSiteIds } from '../../../functions/api/_lib/checker.js'
import { toSiteDto } from '../../../functions/api/_lib/db.js'
import { validateSitePayload } from '../../../functions/api/_lib/validate.js'

const ROOT = 'E:/react/food-nav'
const lines = []
let pass = 0
let fail = 0
function check(name, cond, extra = '') {
  const line = cond ? `  ok  ${name}` : `  FAIL ${name}${extra ? ` -> ${extra}` : ''}`
  if (cond) pass += 1
  else fail += 1
  console.log(line)
  lines.push(line)
}
const flat = (sql) => String(sql || '').replace(/\s+/g, ' ').trim()

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

/* ---------- A. pickTargets 三条路径全部排除 skip_check=1 ---------- */
{
  const dbDefault = mockDb([])
  await pickTargets(dbDefault, null, null)
  const sqlDefault = dbDefault.statements[0]?.sql || ''
  check('A. 默认全量路径排除豁免站', /AND skip_check = 0/.test(sqlDefault), flat(sqlDefault))
  check(
    'A. 默认全量路径仍含 broken（复活机制不回归）',
    /status IN \('active', 'checking', 'broken'\)/.test(sqlDefault),
    flat(sqlDefault),
  )

  const dbSince = mockDb([])
  await pickTargets(dbSince, null, '2026-10-08 00:00:00.000')
  const sqlSince = dbSince.statements[0]?.sql || ''
  check('A. since 路径（cron/手动全量）排除豁免站', /AND skip_check = 0/.test(sqlSince), flat(sqlSince))
  check(
    'A. since 路径仍按 last_checked_at 最久优先',
    /ORDER BY \(last_checked_at IS NULL\) DESC, last_checked_at ASC/.test(sqlSince),
    '',
  )

  const dbIds = mockDb([])
  await pickTargets(dbIds, [8], null)
  const sqlIds = dbIds.statements[0]?.sql || ''
  check('A. 单站路径排除豁免站', /AND skip_check = 0/.test(sqlIds), flat(sqlIds))
  check('A. 单站路径仍不过滤 status（broken 可被单站救回）', !/status IN/.test(sqlIds), flat(sqlIds))
}

/* ---------- B. skippedSiteIds：单站检测跳过提示 ---------- */
{
  const db = mockDb([{ id: 8 }])
  const ids = await skippedSiteIds(db, [8])
  const sql = db.statements[0]?.sql || ''
  check('B. skippedSiteIds 命中豁免站 → [8]', Array.isArray(ids) && ids.length === 1 && ids[0] === 8, JSON.stringify(ids))
  check('B. skippedSiteIds SQL 过滤 skip_check = 1', /AND skip_check = 1/.test(sql), flat(sql))
  check('B. 空/非法 siteIds → []', JSON.stringify(await skippedSiteIds(db, null)) === '[]', '')
  const dbNone = mockDb([])
  const none = await skippedSiteIds(dbNone, [28])
  check('B. 非豁免站 → []（走正常检测）', none.length === 0, JSON.stringify(none))
}

/* ---------- C. DTO：skip_check → skipCheck ---------- */
{
  const on = toSiteDto({ id: 8, skip_check: 1, name: 'x' })
  const off = toSiteDto({ id: 28, skip_check: 0, name: 'y' })
  const legacy = toSiteDto({ id: 1, name: 'z' })
  check('C. toSiteDto skip_check=1 → skipCheck true', on.skipCheck === true, String(on.skipCheck))
  check('C. toSiteDto skip_check=0 → skipCheck false', off.skipCheck === false, String(off.skipCheck))
  check('C. toSiteDto 缺列 → skipCheck false（向后兼容）', legacy.skipCheck === false, String(legacy.skipCheck))
}

/* ---------- D. 写入校验：skipCheck 归一 0/1 ---------- */
{
  const create = validateSitePayload(
    { name: 'n', url: 'https://a.com/', icon: 'cake', categoryId: 2, skipCheck: false },
    { requireComplete: true },
  )
  check('D. 创建（默认 false）→ skipCheck=0', create.ok && create.value.skipCheck === 0, JSON.stringify(create))
  const createOn = validateSitePayload(
    { name: 'n', url: 'https://a.com/', icon: 'cake', categoryId: 2, skipCheck: true },
    { requireComplete: true },
  )
  check('D. 创建（勾选）→ skipCheck=1', createOn.ok && createOn.value.skipCheck === 1, JSON.stringify(createOn))
  const createBare = validateSitePayload(
    { name: 'n', url: 'https://a.com/', icon: 'cake', categoryId: 2 },
    { requireComplete: true },
  )
  check(
    'D. 创建不传 skipCheck → 不写入（DB 默认 0）',
    createBare.ok && !('skipCheck' in createBare.value),
    JSON.stringify(createBare.value),
  )
  const update = validateSitePayload({ skipCheck: true })
  check('D. 局部更新 skipCheck=true → 1', update.ok && update.value.skipCheck === 1, JSON.stringify(update))
  const bad = validateSitePayload({ skipCheck: 'yes' })
  check('D. 非法 skipCheck 类型 → 校验失败', !bad.ok && /skipCheck/.test(bad.message || ''), JSON.stringify(bad))
}

/* ---------- E. 新站真实检测：美食天下 / 好豆网 → active ---------- */
for (const site of [
  { id: 29, name: '美食天下', url: 'https://www.meishichina.com/' },
  { id: 30, name: '好豆网', url: 'https://www.haodou.com/' },
]) {
  const result = await checkOne(site.url, { timeoutMs: 6000 })
  const next = nextSiteState({ status: 'active', fail_count: 0 }, result)
  check(
    `E. ${site.name} 单站检测 → active`,
    next.status === 'active',
    `code=${result.statusCode} note=${result.note} status=${next.status}`,
  )
  console.log(`       ${site.url} code=${result.statusCode} ${result.note} → ${next.status}`)
  lines.push(`       ${site.url} code=${result.statusCode} ${result.note} → ${next.status}`)
}

/* ---------- F. 运行时代码：跳过语义接线 ---------- */
{
  const runSrc = await readFile(`${ROOT}/functions/api/check/run.js`, 'utf8')
  check('F. run.js 引入 skippedSiteIds', runSrc.includes('skippedSiteIds'), '')
  check('F. run.js 返回 {skipped:true, skippedIds}', /skipped:\s*true/.test(runSrc) && runSrc.includes('skippedIds'), '')
  const checkerSrc = await readFile(`${ROOT}/functions/api/_lib/checker.js`, 'utf8')
  check('F. checker.js 文件头写明 M9-T3 豁免机制', checkerSrc.includes('豁免机制（M9-T3'), '')
  check('F. checker.js 导出 skippedSiteIds', /export async function skippedSiteIds/.test(checkerSrc), '')
}

/* ---------- G. migration 006 内容断言 ---------- */
{
  const sql = await readFile(`${ROOT}/schema/migrations/006-skip-check.sql`, 'utf8')
  check('G. 006 加列 skip_check', /ALTER TABLE sites ADD COLUMN skip_check INTEGER NOT NULL DEFAULT 0/.test(sql), '')
  check('G. 006 删 id 9/10 并级联四表', /DELETE FROM favorites\s+WHERE site_id IN \(9, 10\)/.test(sql) && /DELETE FROM site_stats\s+WHERE site_id IN \(9, 10\)/.test(sql) && /DELETE FROM check_logs\s+WHERE site_id IN \(9, 10\)/.test(sql) && /DELETE FROM sites\s+WHERE id IN \(9, 10\)/.test(sql), '')
  check('G. 006 插入 29 美食天下', /SELECT 29, 2, '美食天下'/.test(sql) && sql.includes('https://www.meishichina.com/'), '')
  check('G. 006 插入 30 好豆网', /SELECT 30, 2, '好豆网'/.test(sql) && sql.includes('https://www.haodou.com/'), '')
  check('G. 006 新站 status=active 且不自动打标', /'active', 0, 0, datetime\('now'\)/.test(sql) && /'', 3, 'active'/.test(sql), '')
  check('G. 006 新站统计行 29/30', /SELECT v\.site_id, 0, 0, 0/.test(sql) && /SELECT 29 AS site_id UNION ALL SELECT 30/.test(sql), '')
  check('G. 006 tinrry 豁免 + active + fail_count 清零', /SET skip_check = 1, status = 'active', fail_count = 0/.test(sql) && /WHERE id = 8/.test(sql), '')
}

/* ---------- H. admin 前端：开关 + 徽标 ---------- */
{
  const form = await readFile(`${ROOT}/src/admin/AdminSiteForm.jsx`, 'utf8')
  check('H. 表单含「跳过自动检测」checkbox（aria-label）', /aria-label="跳过自动检测"/.test(form), '')
  check('H. 表单提交 payload 含 skipCheck', /skipCheck,/.test(form) || /skipCheck: skipCheck/.test(form), '')
  check('H. 表单编辑回显 initial.skipCheck', /initial\.skipCheck === true/.test(form), '')
  const sites = await readFile(`${ROOT}/src/admin/AdminSites.jsx`, 'utf8')
  check('H. 站点表格显示豁免徽标', /豁免/.test(sites) && /site\.skipCheck/.test(sites), '')
  check('H. 单站检测跳过提示', /payload\.data\.skipped/.test(sites), '')
}

const summaryLine = `RESULT: ${pass} passed / ${fail} failed`
console.log(`\n${summaryLine}`)
lines.push('', summaryLine)
await writeFile(
  `${ROOT}/dev-docs/reports/task-21/skip-test-log.txt`,
  `# task-21 · M9-T3 豁免机制单测日志 · ${new Date().toISOString()}\n# 覆盖 pickTargets 三路径排除 / skippedSiteIds / DTO / 校验 / run.js 语义 / migration 006 / admin 前端 / 新站真实检测\n\n${lines.join('\n')}\n`,
  'utf8',
)
process.exit(fail > 0 ? 1 : 0)
