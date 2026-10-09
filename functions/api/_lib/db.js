/**
 * D1（SQLite）查询封装：binding 获取 + 查询 + DB 行 → API DTO（camelCase）映射
 * DB 列 snake_case，接口字段 camelCase，两处对齐见 dev-docs/tasks/task-8。
 */

/** 取 D1 binding；未绑定时抛出带 code 的错误，由 errorResponse 统一转 503 */
export function getDb(env) {
  const db = env && env.DB
  if (!db) {
    const error = new Error('D1 binding "DB" is not configured')
    error.code = 'DB_UNAVAILABLE'
    throw error
  }
  return db
}

const SITE_COLUMNS = `
  s.id AS id,
  s.category_id AS category_id,
  c.key AS category_key,
  s.name AS name,
  s."desc" AS description,
  s.url AS url,
  s.icon AS icon,
  s.cover_img AS cover_img,
  s.tag AS tag,
  s.sort_order AS sort_order,
  s.status AS status,
  s.fail_count AS fail_count,
  s.skip_check AS skip_check,
  s.last_checked_at AS last_checked_at,
  COALESCE(st.heat_score, 0) AS heat_score,
  COALESCE(st.favorite_count, 0) AS favorite_count,
  COALESCE(st.click_count, 0) AS click_count
`

/** 分类列表：按 sort_order 升序 */
export async function listCategories(db) {
  const { results } = await db
    .prepare(
      'SELECT id, key, name, icon, sort_order FROM categories ORDER BY sort_order ASC, id ASC',
    )
    .all()
  return results || []
}

/**
 * 站点列表
 * @param {{category?:string,q?:string,status?:string,sort?:string}} filter
 *  - category: 按 categories.key 过滤
 *  - q: name + description 模糊匹配（ASCII 大小写不敏感）
 *  - status: 默认 'active'（broken 不展示）；传 'all' 表示不过滤
 *  - sort: 'heat' → heat_score DESC；其余（默认 manual）→ 分类 sort_order → 站点 sort_order
 */
export async function listSites(db, filter) {
  const where = []
  const params = []

  if (filter && filter.category) {
    where.push('c.key = ?')
    params.push(filter.category)
  }
  const status = (filter && filter.status) || 'active'
  if (status !== 'all') {
    where.push('s.status = ?')
    params.push(status)
  }
  if (filter && filter.q) {
    where.push(
      `(LOWER(s.name) LIKE LOWER(?) OR LOWER(s."desc") LIKE LOWER(?))`,
    )
    params.push(`%${filter.q}%`, `%${filter.q}%`)
  }

  const order =
    filter && filter.sort === 'heat'
      ? 'heat_score DESC, c.sort_order ASC, s.sort_order ASC, s.id ASC'
      : 'c.sort_order ASC, s.sort_order ASC, s.id ASC'

  const sql = `SELECT ${SITE_COLUMNS}
    FROM sites s
    JOIN categories c ON c.id = s.category_id
    LEFT JOIN site_stats st ON st.site_id = s.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${order}`

  const statement = db.prepare(sql)
  const bound = params.length ? statement.bind(...params) : statement
  const { results } = await bound.all()
  return results || []
}

/** 单站详情：不存在返回 null */
export async function getSite(db, id) {
  const row = await db
    .prepare(`SELECT ${SITE_COLUMNS}
      FROM sites s
      JOIN categories c ON c.id = s.category_id
      LEFT JOIN site_stats st ON st.site_id = s.id
      WHERE s.id = ?`)
    .bind(id)
    .first()
  return row || null
}

/** 数据库探活：成功返回 true，失败抛错 */
export async function ping(db) {
  const row = await db.prepare('SELECT 1 AS ok').first()
  return Boolean(row)
}

/** 分类行 → 接口 DTO */
export function toCategoryDto(row) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    icon: row.icon,
    sortOrder: row.sort_order,
  }
}

/** 站点行 → 接口 DTO（对齐前端 NavItem 契约：camelCase） */
export function toSiteDto(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryKey: row.category_key,
    name: row.name,
    desc: row.description,
    url: row.url,
    icon: row.icon,
    coverImg: row.cover_img,
    tag: row.tag,
    sortOrder: row.sort_order,
    status: row.status,
    failCount: row.fail_count ?? 0,
    skipCheck: !!row.skip_check,
    lastCheckedAt: row.last_checked_at || null,
    heatScore: row.heat_score,
    favoriteCount: row.favorite_count,
    clickCount: row.click_count,
  }
}

/* ============ 写操作（M2 管理接口） ============ */

/** DTO 字段名 → 数据库列（动态 UPDATE 用白名单） */
const SITE_FIELD_COLUMNS = {
  name: 'name',
  desc: '"desc"',
  url: 'url',
  icon: 'icon',
  coverImg: 'cover_img',
  tag: 'tag',
  sortOrder: 'sort_order',
  categoryId: 'category_id',
  status: 'status',
  skipCheck: 'skip_check',
}

const CATEGORY_FIELD_COLUMNS = {
  key: 'key',
  name: 'name',
  icon: 'icon',
  sortOrder: 'sort_order',
}

/** 创建站点（校验后的 value），返回完整 DTO 行 */
export async function createSite(db, value) {
  const row = await db
    .prepare(
      `INSERT INTO sites (category_id, name, "desc", url, icon, cover_img, tag, sort_order, status, skip_check)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      value.categoryId,
      value.name,
      value.desc ?? '',
      value.url,
      value.icon,
      value.coverImg ?? '',
      value.tag ?? '',
      value.sortOrder ?? 0,
      value.status ?? 'active',
      value.skipCheck ?? 0,
    )
    .first()
  return getSite(db, row.id)
}

/** 局部更新站点（白名单字段），返回完整 DTO 行 */
export async function updateSite(db, id, value) {
  const sets = []
  const params = []
  for (const [field, column] of Object.entries(SITE_FIELD_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      sets.push(`${column} = ?`)
      params.push(value[field])
    }
  }
  if (sets.length === 0) return getSite(db, id)
  sets.push(`updated_at = datetime('now')`)
  await db
    .prepare(`UPDATE sites SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...params, id)
    .run()
  return getSite(db, id)
}

/** 删除站点（显式清理 site_stats / check_logs，不依赖外键 pragma） */
export async function deleteSite(db, id) {
  await db.batch([
    db.prepare('DELETE FROM check_logs WHERE site_id = ?').bind(id),
    db.prepare('DELETE FROM site_stats WHERE site_id = ?').bind(id),
    db.prepare('DELETE FROM sites WHERE id = ?').bind(id),
  ])
}

/** 分类是否存在 */
export async function categoryExists(db, id) {
  const row = await db.prepare('SELECT id FROM categories WHERE id = ?').bind(id).first()
  return Boolean(row)
}

/** 分类 key 是否已被占用（创建时 409 用） */
export async function categoryKeyExists(db, key, exceptId) {
  const row = exceptId
    ? await db.prepare('SELECT id FROM categories WHERE key = ? AND id != ?').bind(key, exceptId).first()
    : await db.prepare('SELECT id FROM categories WHERE key = ?').bind(key).first()
  return Boolean(row)
}

/** 分类行（含全部字段） */
export async function getCategory(db, id) {
  const row = await db
    .prepare('SELECT id, key, name, icon, sort_order FROM categories WHERE id = ?')
    .bind(id)
    .first()
  return row || null
}

/** 创建分类，返回完整 DTO */
export async function createCategory(db, value) {
  const row = await db
    .prepare(
      `INSERT INTO categories (key, name, icon, sort_order)
       VALUES (?, ?, ?, ?)
       RETURNING id, key, name, icon, sort_order`,
    )
    .bind(value.key, value.name, value.icon, value.sortOrder ?? 0)
    .first()
  return row
}

/** 局部更新分类（白名单字段），返回完整 DTO */
export async function updateCategory(db, id, value) {
  const sets = []
  const params = []
  for (const [field, column] of Object.entries(CATEGORY_FIELD_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      sets.push(`${column} = ?`)
      params.push(value[field])
    }
  }
  if (sets.length > 0) {
    sets.push(`updated_at = datetime('now')`)
    await db
      .prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...params, id)
      .run()
  }
  return getCategory(db, id)
}

/** 删除分类：先删该分类下的站点统计与站点，再删分类（级联不依赖 pragma） */
export async function deleteCategory(db, id) {
  await db.batch([
    db
      .prepare(
        'DELETE FROM check_logs WHERE site_id IN (SELECT id FROM sites WHERE category_id = ?)',
      )
      .bind(id),
    db
      .prepare('DELETE FROM site_stats WHERE site_id IN (SELECT id FROM sites WHERE category_id = ?)')
      .bind(id),
    db.prepare('DELETE FROM sites WHERE category_id = ?').bind(id),
    db.prepare('DELETE FROM categories WHERE id = ?').bind(id),
  ])
}
