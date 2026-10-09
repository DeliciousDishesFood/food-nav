import { fail } from './_lib/response.js'

/**
 * /api/ catch-all（M9-T4，task-22）
 * Pages Functions 里已定义路由优先级更高，本文件只捕获 /api/ 下未命中的路径，
 * 返回 404 JSON 信封，替代此前回落 SPA index.html 的 200 HTML（语义错误）。
 * 静态资源（/assets /covers 等）不在 /api/ 下，不受影响。
 */
export function onRequest(context) {
  return fail('not_found', 'Not Found', context.request, 404)
}
