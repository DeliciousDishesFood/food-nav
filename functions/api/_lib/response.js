/**
 * 统一响应信封 + 开发期 CORS 头
 *
 * 信封约定（见 dev-docs/architecture/02-backend-design.md §2.0）：
 *   成功：{ ok: true,  data }
 *   失败：{ ok: false, error: { code, message } }
 *
 * CORS：生产环境前端与 API 同源（food-nav.shiora.cc/api/*），无需 CORS；
 * 开发期本地 Vite dev server（默认 5173，任务约定 5174）跨源访问需要回显 Origin。
 * 这里只对 localhost / 127.0.0.1 的任意端口放行，其它来源一律不加 CORS 头。
 */
const DEV_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

export function corsHeaders(request) {
  const origin = request && request.headers ? request.headers.get('Origin') : null
  if (origin && DEV_ORIGIN_RE.test(origin)) {
    return {
      'access-control-allow-origin': origin,
      vary: 'Origin',
    }
  }
  return {}
}

function json(request, body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign(
      {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
      corsHeaders(request),
      extraHeaders || {},
    ),
  })
}

/** 成功信封：ok(data, request) */
export function ok(data, request, status) {
  return json(request, { ok: true, data }, status || 200)
}

/** 失败信封：fail(code, message, request, status) */
export function fail(code, message, request, status) {
  return json(request, { ok: false, error: { code, message } }, status || 500)
}

/** 把后端异常映射成失败信封（数据库未绑定 → 503，其余 → 500） */
export function errorResponse(error, request) {
  if (error && error.code === 'DB_UNAVAILABLE') {
    return fail('db_unavailable', '数据库未绑定，请检查 D1 binding', request, 503)
  }
  return fail('internal_error', '服务器内部错误', request, 500)
}
