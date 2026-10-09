import { errorResponse } from '../_lib/response.js'
import { handleTrack } from '../_lib/track.js'

/**
 * POST /api/track/click  body {url}
 * 按 url 精确匹配 sites → click_count +1、heat 重算；找不到站点静默忽略。
 * 同源校验（Sec-Fetch-Site / Origin 白名单）+ IP×分钟限频；成功与否都回 {ok:true}。
 */
export async function onRequestPost(context) {
  const { request, env } = context
  try {
    return await handleTrack(request, env, 'click', (body) =>
      typeof body.url === 'string' ? body.url.trim() : '',
    )
  } catch (error) {
    return errorResponse(error, request)
  }
}
