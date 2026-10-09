/**
 * 写接口字段校验（M2）：站点 / 分类 / favicon 域名（防 SSRF）
 * 约定：校验失败返回 { ok:false, message } → 路由转 400 {code:'validation_error'}
 *      校验通过返回 { ok:true, value }（value 为 trim/规范化后的字段）
 */

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/
const COVER_PATH_RE = /^\/covers\/[a-z0-9-]+\.svg$/
const CATEGORY_KEY_RE = /^[a-z0-9-]+$/
const SITE_STATUS = new Set(['active', 'broken', 'checking'])

/** 主站保留的虚拟分类 key，禁止管理员创建同名分类（会与 Tab 冲突） */
export const RESERVED_CATEGORY_KEYS = new Set(['all', 'favorites'])

/** 读取 JSON 请求体；空 / 非对象 → null */
export async function readJson(request) {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}

/** Unicode 码点长度（按“字”计数，避免 emoji/汉字被截断误判） */
function textLen(value) {
  return [...value].length
}

/** 必须是 http(s):// 合法 URL 且 ≤300 字符，返回规范化值，否则 null */
export function normalizeHttpUrl(raw) {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value || value.length > 300) return null
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  return value
}

/**
 * favicon 代理域名白名单校验（防 SSRF）
 * 拒绝：格式非法 / IP（v4/v6）/ localhost / 单标签内网名 / 内网段（10. 127. 172.16-31. 192.168. 169.254. 等）
 * @param {string} domain
 * @returns {boolean}
 */
export function isPublicDomain(domain) {
  if (typeof domain !== 'string') return false
  const value = domain.trim().toLowerCase().replace(/\.$/, '')
  if (!value || value.length > 253) return false
  if (!DOMAIN_RE.test(value)) return false
  if (IPV4_RE.test(value)) return false
  if (value.includes(':')) return false
  if (
    value === 'localhost' ||
    value.endsWith('.localhost') ||
    value.endsWith('.local') ||
    value.endsWith('.internal') ||
    value.endsWith('.home') ||
    value.endsWith('.lan')
  ) {
    return false
  }
  if (/^(0|10|127|169\.254|192\.168|100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7]))\./.test(value)) {
    return false
  }
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(value)) return false
  if (/^(198\.1[89]|198\.51\.100|203\.0\.113)\./.test(value)) return false
  return true
}

/** 封面三模式：空 | /covers/xxx.svg（内置插画） | favicon:<公网域名> | http(s) 图片 URL */
export function normalizeCoverImg(raw) {
  const cover = typeof raw === 'string' ? raw.trim() : ''
  if (!cover) return { ok: true, value: '' }
  if (cover.startsWith('favicon:')) {
    const domain = cover.slice('favicon:'.length).trim().toLowerCase()
    if (!isPublicDomain(domain)) {
      return { ok: false, message: 'favicon 模式需要合法的公网域名（不支持 IP / 内网）' }
    }
    return { ok: true, value: `favicon:${domain}` }
  }
  if (cover.startsWith('/')) {
    if (cover.length > 100 || !COVER_PATH_RE.test(cover)) {
      return { ok: false, message: '内置插画路径不合法（应为 /covers/xxx.svg）' }
    }
    return { ok: true, value: cover }
  }
  const url = normalizeHttpUrl(cover)
  if (!url) {
    return { ok: false, message: '封面需为空、内置插画、favicon:域名 或 http(s) 图片地址' }
  }
  return { ok: true, value: url }
}

/**
 * 站点写入校验
 * @param {Object} payload
 * @param {{requireComplete?: boolean}} options requireComplete=true 为创建（必填字段齐全）
 * @returns {{ok:boolean, message?:string, value?:Object}}
 */
export function validateSitePayload(payload, options = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: '请求体必须是 JSON 对象' }
  }
  const requireComplete = options.requireComplete === true
  const has = (key) => Object.prototype.hasOwnProperty.call(payload, key)
  const messages = []
  const value = requireComplete
    ? { desc: '', coverImg: '', tag: '', sortOrder: 0 }
    : {}

  if (requireComplete || has('name')) {
    const name = typeof payload.name === 'string' ? payload.name.trim() : ''
    if (!name) messages.push('站点名称必填')
    else if (textLen(name) > 50) messages.push('站点名称不能超过 50 字')
    else value.name = name
  }

  if (requireComplete || has('url')) {
    const url = normalizeHttpUrl(payload.url)
    if (!url) messages.push('链接必须是 http(s):// 开头的合法地址（≤300 字符）')
    else value.url = url
  }

  if (has('desc')) {
    const desc = payload.desc === null || payload.desc === undefined ? '' : payload.desc
    if (typeof desc !== 'string') messages.push('描述必须是字符串')
    else if (textLen(desc.trim()) > 100) messages.push('描述不能超过 100 字')
    else value.desc = desc.trim()
  }

  if (requireComplete || has('icon')) {
    const icon = typeof payload.icon === 'string' ? payload.icon.trim() : ''
    if (!icon) messages.push('图标必填，请从图标选择器中挑选')
    else if (textLen(icon) > 50) messages.push('图标名过长')
    else value.icon = icon
  }

  if (requireComplete || has('coverImg')) {
    const cover = normalizeCoverImg(payload.coverImg)
    if (!cover.ok) messages.push(cover.message)
    else value.coverImg = cover.value
  }

  if (has('tag')) {
    const tag = payload.tag === null || payload.tag === undefined ? '' : payload.tag
    if (typeof tag !== 'string') messages.push('角标必须是字符串')
    else if (textLen(tag.trim()) > 10) messages.push('角标不能超过 10 字')
    else value.tag = tag.trim()
  }

  if (requireComplete || has('categoryId')) {
    const categoryId = payload.categoryId
    if (!Number.isInteger(categoryId) || categoryId <= 0) messages.push('必须选择所属分类')
    else value.categoryId = categoryId
  }

  if (has('sortOrder')) {
    const sortOrder = payload.sortOrder
    if (!Number.isInteger(sortOrder) || sortOrder < 0) messages.push('排序必须是 ≥0 的整数')
    else value.sortOrder = sortOrder
  } else if (requireComplete) {
    value.sortOrder = 0
  }

  if (has('status') && payload.status !== '' && payload.status !== null) {
    if (!SITE_STATUS.has(payload.status)) messages.push('状态只能是 active / broken / checking')
    else value.status = payload.status
  }

  // M9-T3 检测豁免：布尔/0/1 → 0|1（DB 列 skip_check INTEGER）
  if (has('skipCheck') && payload.skipCheck !== '' && payload.skipCheck !== null) {
    const skip = payload.skipCheck
    if (typeof skip !== 'boolean' && skip !== 0 && skip !== 1) {
      messages.push('skipCheck 只能是布尔值')
    } else value.skipCheck = skip === true || skip === 1 ? 1 : 0
  }

  if (messages.length > 0) return { ok: false, message: messages[0] }
  return { ok: true, value }
}

/**
 * 分类写入校验
 * @param {Object} payload
 * @param {{requireComplete?: boolean}} options
 * @returns {{ok:boolean, message?:string, value?:Object}}
 */
export function validateCategoryPayload(payload, options = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: '请求体必须是 JSON 对象' }
  }
  const requireComplete = options.requireComplete === true
  const has = (key) => Object.prototype.hasOwnProperty.call(payload, key)
  const messages = []
  const value = requireComplete ? { sortOrder: 0 } : {}

  if (requireComplete || has('key')) {
    const key = typeof payload.key === 'string' ? payload.key.trim() : ''
    if (!key) messages.push('分类 key 必填')
    else if (textLen(key) > 40 || !CATEGORY_KEY_RE.test(key)) {
      messages.push('分类 key 只能由小写字母 / 数字 / 连字符组成')
    } else if (RESERVED_CATEGORY_KEYS.has(key)) {
      messages.push(`"${key}" 是主站保留标识，不能用作分类 key`)
    } else value.key = key
  }

  if (requireComplete || has('name')) {
    const raw = typeof payload.name === 'string' ? payload.name.trim() : ''
    if (!raw) messages.push('分类名称必填')
    else if (textLen(raw) > 20) messages.push('分类名称不能超过 20 字')
    else value.name = raw
  }

  if (requireComplete || has('icon')) {
    const icon = typeof payload.icon === 'string' ? payload.icon.trim() : ''
    if (!icon) messages.push('分类图标必填，请从图标选择器中挑选')
    else if (textLen(icon) > 50) messages.push('图标名过长')
    else value.icon = icon
  }

  if (has('sortOrder')) {
    const sortOrder = payload.sortOrder
    if (!Number.isInteger(sortOrder) || sortOrder < 0) messages.push('排序必须是 ≥0 的整数')
    else value.sortOrder = sortOrder
  } else if (requireComplete) {
    value.sortOrder = 0
  }

  if (messages.length > 0) return { ok: false, message: messages[0] }
  return { ok: true, value }
}
