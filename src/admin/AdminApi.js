/**
 * 管理面板 API 客户端（M2）
 * 零耦合约束：本模块不 import 任何主站组件 / hooks / 数据，只依赖 fetch + localStorage。
 * - 所有请求走同源 /api，登录后自动带 Authorization: Bearer <token>
 * - 收到 401 → 清 token 并广播 admin-logout（AdminPage 监听后自动回登录页）
 */

export const ADMIN_TOKEN_KEY = 'food-nav:admin-token'
export const ADMIN_LOGOUT_EVENT = 'admin-logout'

const API_BASE = '/api'

function emitLogout() {
  try {
    window.dispatchEvent(new CustomEvent(ADMIN_LOGOUT_EVENT))
  } catch {
    /* SSR / 老浏览器：忽略 */
  }
}

/** 读取本地 token；过期 / 结构损坏一律清掉并返回 null */
export function readStoredToken() {
  try {
    const raw = window.localStorage.getItem(ADMIN_TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed.token !== 'string' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      clearStoredToken()
      return null
    }
    if (parsed.expiresAt <= Date.now()) {
      clearStoredToken()
      return null
    }
    return parsed
  } catch {
    clearStoredToken()
    return null
  }
}

export function saveStoredToken(token, expiresAt) {
  try {
    window.localStorage.setItem(
      ADMIN_TOKEN_KEY,
      JSON.stringify({ token, expiresAt }),
    )
  } catch {
    /* 隐私模式：本次会话仍可通过内存态登录 */
  }
}

export function clearStoredToken() {
  try {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {
    /* 忽略 */
  }
}

/**
 * 统一请求
 * @returns {Promise<{status:number, payload:Object}>} payload 恒为信封对象
 */
export async function adminRequest(path, options = {}) {
  const stored = readStoredToken()
  const headers = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (stored) headers.Authorization = `Bearer ${stored.token}`

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    return {
      status: 0,
      payload: {
        ok: false,
        error: { code: 'network_error', message: '网络异常，请检查连接后重试' },
      },
    }
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!payload || typeof payload !== 'object') {
    payload = {
      ok: false,
      error: { code: 'bad_response', message: `服务端响应异常（${response.status}）` },
    }
  }

  if (response.status === 401 && payload.ok !== true && path !== '/admin/login') {
    clearStoredToken()
    emitLogout()
  }
  return { status: response.status, payload }
}

/** 从信封里取可读错误文案 */
export function errorMessage(payload, fallback = '操作失败，请稍后重试') {
  if (payload && payload.ok === false && payload.error && payload.error.message) {
    return payload.error.message
  }
  return fallback
}
/* ---------- 接口封装 ---------- */

/**
 * 数据变更成功后静默刷新主站导航缓存（M6）：
 * 「admin 改数据 → 回主页」首帧即为最新 API 数据，回页不再出现旧→新 swap 抖动。
 * 用动态 import 保持本模块的静态零耦合（不静态依赖主站 hooks/数据）；
 * 刷新失败静默（缓存 30 分钟 TTL 兜底），绝不影响管理端自身的成功提示。
 */
function afterMutation(promise) {
  promise
    .then((result) => {
      if (result && result.payload && result.payload.ok === true) {
        import('../api/navApi.js')
          .then((mod) => mod.refreshNavCache())
          .catch(() => {
            /* 静默 */
          })
      }
    })
    .catch(() => {
      /* 静默 */
    })
  return promise
}

export const adminLogin = (password) =>
  adminRequest('/admin/login', { method: 'POST', body: { password } })

export const fetchAllSites = () => adminRequest('/sites?status=all')
export const fetchCategories = () => adminRequest('/categories')

/**
 * 站点列表（M9 热度榜用）：sort 透传给后端（'heat' → heat_score DESC）。
 * 向后兼容：不传 sort 与 fetchAllSites 同口径（manual 排序）。
 */
export const fetchSites = (status = 'all', sort) =>
  adminRequest(
    `/sites?status=${encodeURIComponent(status)}${sort ? `&sort=${encodeURIComponent(sort)}` : ''}`,
  )

export const createSite = (body) =>
  afterMutation(adminRequest('/sites', { method: 'POST', body }))
export const updateSite = (id, body) =>
  afterMutation(adminRequest(`/sites/${id}`, { method: 'PUT', body }))
export const removeSite = (id) =>
  afterMutation(adminRequest(`/sites/${id}`, { method: 'DELETE' }))

export const createCategory = (body) =>
  afterMutation(adminRequest('/categories', { method: 'POST', body }))
export const updateCategory = (id, body) =>
  afterMutation(adminRequest(`/categories/${id}`, { method: 'PUT', body }))
export const removeCategory = (id) =>
  afterMutation(adminRequest(`/categories/${id}`, { method: 'DELETE' }))

/* ---------- 链接检测（M3） ---------- */

/** 触发一轮检测：不传 siteId = 全量（单轮 ≤10 站，remaining>0 表示还需再跑） */
export const runCheck = (siteId, since) => {
  const body = {}
  if (siteId !== undefined && siteId !== null) body.siteId = siteId
  if (since) body.since = since
  return adminRequest('/check/run', { method: 'POST', body })
}

/** 检测日志（分页，按时间倒序） */
export function fetchCheckLogs({ siteId, limit = 30, offset = 0 } = {}) {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (siteId !== undefined && siteId !== null) query.set('site_id', String(siteId))
  return adminRequest(`/check/logs?${query.toString()}`)
}

/* ---------- 访问统计（M4） ---------- */

/** 每日 UV：days=1 仅今日，默认 30 天 → { list:[{date, uv}] } */
export const fetchVisits = (days = 30) =>
  adminRequest(`/stats/visits?days=${Number(days) || 30}`)

/* ---------- 封面 / favicon 预览（与主站 navApi 同一转换约定） ---------- */

export function faviconUrl(domain) {
  return `${API_BASE}/favicon?domain=${encodeURIComponent(domain)}`
}

/** 封面值 → 可直接给 <img src> 的地址；空值返回 ''（渲染内置占位插画） */
export function coverPreviewUrl(coverImg) {
  const value = typeof coverImg === 'string' ? coverImg.trim() : ''
  if (!value) return ''
  if (value.startsWith('favicon:')) return faviconUrl(value.slice('favicon:'.length))
  return value
}
