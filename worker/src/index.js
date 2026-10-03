/**
 * 食光导航 · 一言接口 CORS 代理（Cloudflare Workers）
 *
 * 背景：https://quote.shiora.cc 不返回 Access-Control-Allow-Origin，
 * 浏览器直连会 200 OK 却读不到响应体。部署本代理后，
 * 把地址填进构建环境变量 VITE_QUOTE_PROXY 即可：
 *   VITE_QUOTE_PROXY=https://food-nav-quote-proxy.<account>.workers.dev
 *
 * 路由：
 *   GET  /api/hitokoto?type=a  → 转发上游并补齐 CORS 头
 *   OPTIONS /api/*             → CORS 预检
 */

const UPSTREAM_ORIGIN = 'https://quote.shiora.cc'
const ALLOWED_PATH = '/api/'
const CACHE_SECONDS = 600

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Accept',
  'Access-Control-Max-Age': '86400',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    },
  })
}

export default {
  async fetch(request) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (request.method !== 'GET' || !url.pathname.startsWith(ALLOWED_PATH)) {
      return json({ error: 'Not Found' }, 404)
    }

    const upstream = `${UPSTREAM_ORIGIN}${url.pathname}${url.search}`

    try {
      const response = await fetch(upstream, {
        headers: { Accept: 'application/json' },
      })
      const text = await response.text()

      // 上游异常时返回结构稳定的 JSON，前端解析逻辑保持一致
      if (!response.ok) {
        return json({ error: 'upstream error', status: response.status }, 502)
      }

      return new Response(text, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type':
            response.headers.get('content-type') ??
            'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
        },
      })
    } catch (error) {
      return json({ error: 'fetch failed', message: String(error) }, 502)
    }
  },
}
