import { errorResponse } from '../_lib/response.js'
import { handleTrack } from '../_lib/track.js'

/**
 * POST /api/track/favorite  body {name}
 * 按 name 精确匹配 sites → favorite_count +1、heat 重算；取消收藏不上报（前端语义）。
 * 同源校验（Sec-Fetch-Site / Origin 白名单）+ IP×分钟限频；成功与否都回 {ok:true}。
 */
export async function onRequestPost(context) {
  const { request, env } = context
  try {
    return await handleTrack(request, env, 'favorite', (body) =>
      typeof body.name === 'string' ? body.name.trim() : '',
    )
  } catch (error) {
    return errorResponse(error, request)
  }
}
