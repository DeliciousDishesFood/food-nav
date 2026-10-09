/**
 * M4 每日 UV 访问统计（Pages 根中间件，前端零改动）
 *
 * 只统计页面请求：路径白名单 {'/', '/admin'} + Accept 含 text/html；
 * 一切 /api/、静态文件（.js/.css/.png/.svg/.ico/…）一律不计入，避免 UV 虚高。
 *
 * 访客标识：匿名 cookie fv_id（uuid，无个人信息，前端不读）；无 cookie → 生成并回写，Max-Age 1 年。
 * 去重：daily_visits (visit_date, visitor_id) 主键，INSERT OR IGNORE → 同一访客当日重复访问零成本。
 * 限频：同 IP 分钟桶 >30 次 → 跳过（不阻断页面）。
 * 注意：不做出站来源过滤——从搜索引擎/外站跳转来的首次访问正是要统计的访客。
 * 铁律：统计任何异常都必须放行页面（try/catch 兜底，绝不影响响应）。
 */
import { overTrackLimit } from './api/_lib/track.js'

const PAGE_PATHS = new Set(['/', '/admin'])
const COOKIE_NAME = 'fv_id'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const STATIC_EXT_RE =
  /\.(?:js|mjs|cjs|css|map|png|jpe?g|gif|svg|ico|webp|avif|bmp|woff2?|ttf|otf|eot|txt|xml|json|pdf|mp3|mp4|webm|wasm)$/i

/** 归一化路径：去掉末尾斜杠与 index.html，根路径返回 '/' */
function normalizePath(pathname) {
  return pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/'
}

/** 是否为「页面请求」（唯一被计入 UV 的请求类型） */
function isPageRequest(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false
  let pathname
  try {
    pathname = new URL(request.url).pathname
  } catch {
    return false
  }
  const path = normalizePath(pathname)
  if (path === '/api' || path.startsWith('/api/')) return false
  if (STATIC_EXT_RE.test(path)) return false
  if (!PAGE_PATHS.has(path)) return false
  const accept = request.headers.get('accept') || ''
  return accept.includes('text/html')
}

/** 从 Cookie 头取指定 name（无则 null） */
function readCookie(request, name) {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim()
      return value || null
    }
  }
  return null
}

/**
 * 记录一次访问（任何一步失败都向上抛，由 onRequest 兜底放行）；
 * 返回需要回写的 cookie 值（原本就有 cookie 则返回 null）
 */
async function recordVisit(request, env) {
  const db = env && env.DB
  if (!db) return null

  let visitorId = readCookie(request, COOKIE_NAME)
  let issued = false
  if (!visitorId) {
    visitorId = crypto.randomUUID()
    issued = true
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const limited = await overTrackLimit(db, ip, 'visit')
  if (!limited) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO daily_visits (visit_date, visitor_id)
         VALUES (date('now'), ?)`,
      )
      .bind(visitorId)
      .run()
  }
  return issued ? visitorId : null
}

function withCookie(response, visitorId) {
  const cookie = `${COOKIE_NAME}=${visitorId}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`
  const headers = new Headers(response.headers)
  headers.append('Set-Cookie', cookie)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export async function onRequest(context) {
  const { request, env } = context
  const response = await context.next()
  if (!isPageRequest(request)) return response
  try {
    const issuedId = await recordVisit(request, env)
    if (issuedId) return withCookie(response, issuedId)
  } catch {
    /* 统计失败绝不影响页面 */
  }
  return response
}
