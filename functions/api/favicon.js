import { fail } from './_lib/response.js'
import { isPublicDomain } from './_lib/validate.js'

/**
 * GET /api/favicon?domain=xxx — 站点图标代理
 * 防 SSRF：domain 走 isPublicDomain 白名单（拒绝 IP / localhost / 内网段），
 * 且只请求 https://<domain>/favicon.ico。
 * 失败一律回内置 SVG 占位图 → 主站卡片永不破图（NavCard 的 <img> 无 onerror）。
 */
const FETCH_TIMEOUT_MS = 8000
const FETCH_UA = 'food-nav-favicon/1.0'
const MAX_BYTES = 2 * 1024 * 1024

/** 灰色小盘子占位插画（favicon 缺失 / 上游异常时兜底） */
const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="favicon placeholder">
  <rect width="64" height="64" rx="12" fill="#f4f4f5"/>
  <circle cx="32" cy="32" r="17" fill="#ffffff" stroke="#d4d4d8" stroke-width="3"/>
  <circle cx="32" cy="32" r="8.5" fill="none" stroke="#d4d4d8" stroke-width="2"/>
  <path d="M13 19v9c0 2 1.6 3 3 3M16 19v26" fill="none" stroke="#c7c7cc" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M51 19c-3.4 3.2-3.4 10.8 0 14v13" fill="none" stroke="#c7c7cc" stroke-width="2.6" stroke-linecap="round"/>
</svg>`

function placeholderResponse() {
  return new Response(PLACEHOLDER_SVG, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'x-food-favicon': 'placeholder',
    },
  })
}

export async function onRequestGet(context) {
  const { request } = context
  const url = new URL(request.url)
  const domain = (url.searchParams.get('domain') || '').trim().toLowerCase()

  if (!domain) {
    return fail('invalid_domain', '缺少 domain 参数', request, 400)
  }
  if (!isPublicDomain(domain)) {
    return fail('invalid_domain', 'domain 不合法（拒绝 IP / localhost / 内网地址）', request, 400)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const upstream = await fetch(`https://${domain}/favicon.ico`, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': FETCH_UA,
        accept: 'image/*,*/*;q=0.8',
      },
    })
    const contentType = (upstream.headers.get('content-type') || '').toLowerCase()
    if (upstream.ok && contentType.startsWith('image/')) {
      const buffer = await upstream.arrayBuffer()
      if (buffer.byteLength > 0 && buffer.byteLength <= MAX_BYTES) {
        return new Response(buffer, {
          status: 200,
          headers: {
            'content-type': contentType.split(';')[0].trim(),
            'cache-control': 'public, max-age=86400',
            'x-food-favicon': 'upstream',
          },
        })
      }
    }
    return placeholderResponse()
  } catch {
    return placeholderResponse()
  } finally {
    clearTimeout(timer)
  }
}
