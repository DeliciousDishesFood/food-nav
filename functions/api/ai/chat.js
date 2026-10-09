/**
 * M5 · POST /api/ai/chat —— GLM 智能问答代理（同源 /api，免登录，强限流）
 *
 * 关键设计：
 * - 鉴权：不登录（主站访客可用），但同源校验 + IP 分钟桶限流 ≤10（track_limits kind='ai'）
 * - 上游：智谱 OpenAI 兼容接口 open.bigmodel.cn（model 默认 glm-4-flash，可用 env.GLM_MODEL 覆盖；
 *   实测 glm-v4.7-flash=400 模型不存在、glm-4.7-flash=429 过载、glm-4-flash=200 且支持 tools）
 * - Function Calling：tools=[search_food_sites] → 两段式
 *   第一段：解析 GLM SSE。若出现 tool_calls（首帧即含，先缓冲不转发）→ 收完执行检索 →
 *           带 tool 结果发起第二次请求 → 转发第二段流；
 *           若直接出现 content → 立即进入透传模式，逐块转发。
 * - 推荐回传：tool 执行完成后、[DONE] 之前发一个自定义 `event: recommend`（≤6 条，无 tool 不发）
 * - key 安全：GLM_API_KEY 只在服务端 Authorization 头使用，任何错误信封都做脱敏，绝不回传前端
 */
import { clientIp } from '../_lib/auth.js'
import { getDb } from '../_lib/db.js'
import { corsHeaders, errorResponse, fail } from '../_lib/response.js'
import { isSameOriginRequest, overTrackLimit, sameOriginDenied } from '../_lib/track.js'
import { readJson } from '../_lib/validate.js'

const GLM_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const DEFAULT_MODEL = 'glm-4-flash'
/** 单 IP 每分钟 AI 提问上限（超限 429 rate_limited） */
const AI_LIMIT_PER_MINUTE = 10
/** 上游整体超时（含流式）→ 503 */
const UPSTREAM_TIMEOUT_MS = 30000
/** 会话条数与单条长度上限（服务端强制 clamp，防上下文超限） */
const MAX_MESSAGES = 10
const MAX_MESSAGE_CHARS = 2000
/** tool 检索最多回传条数 */
const MAX_TOOL_RESULTS = 6

const SYSTEM_PROMPT = [
  '你是「食光导航」的美食站点推荐助手，服务于一个收录美食网站的导航站。',
  '规则：',
  '1. 当用户询问站内有哪些美食网站、要推荐菜谱/烘焙/咖啡/外卖等站点时，先调用 search_food_sites 工具检索，再依据返回结果推荐；结果为空就如实说明暂未收录，不要编造站点。',
  '2. 调用工具时 query 用 2-4 个字的中文关键词（如「烘焙」「咖啡」「菜谱」），不要带「网站」「有哪些」这类词；category 可填分类中文名（如「烘焙甜点」）。',
  '3. 纯知识性问题（做法、原理、食材）不调用工具，直接简洁作答。',
  '4. 用简体中文回答，语气友好，不输出 markdown 标题，链接由界面卡片展示。',
].join('\n')

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_food_sites',
      description: '检索站内收录的美食网站/站点，用于向用户做推荐',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          category: { type: 'string', description: '分类 key 或分类中文名（可选）' },
        },
        required: ['query'],
      },
    },
  },
]

/** 检索词清洗：去掉口语填充词，再切 2 字滑窗做模糊匹配 */
const FILLER_RE = /(有哪些|有什么|帮我|找一下|寻找|网站|站点|网页|推荐|哪些|什么|哪个|一下|的|吗|呢|类)/g

export function searchTerms(query) {
  const raw = String(query || '').replace(/[\s,，。？?!！、~·]+/g, '')
  const cleaned = raw.replace(FILLER_RE, '')
  const source = cleaned || raw
  if (!source) return []
  const terms = new Set()
  if (source.length <= 2) {
    terms.add(source)
  } else {
    terms.add(source)
    for (let i = 0; i + 2 <= source.length; i += 1) terms.add(source.slice(i, i + 2))
  }
  return [...terms].filter((term) => term.length >= 2).slice(0, 4)
}

/** Function Calling 执行器：D1 检索 status='active' 的站点（按 name/desc/tag/分类名模糊） */
async function searchFoodSites(db, { query, category }) {
  const terms = searchTerms(query)
  const where = [`s.status = 'active'`]
  const params = []

  const wanted = typeof category === 'string' ? category.trim() : ''
  if (wanted) {
    const row = await db
      .prepare('SELECT id FROM categories WHERE key = ? OR name LIKE ? LIMIT 1')
      .bind(wanted, `%${wanted}%`)
      .first()
    if (row) {
      where.push('c.id = ?')
      params.push(row.id)
    }
  }

  if (terms.length) {
    const groups = terms.map(
      () => `(s.name LIKE ? OR s."desc" LIKE ? OR s.tag LIKE ? OR c.name LIKE ?)`,
    )
    where.push(`(${groups.join(' OR ')})`)
    for (const term of terms) {
      const like = `%${term}%`
      params.push(like, like, like, like)
    }
  }

  const { results } = await db
    .prepare(
      `SELECT s.id, s.name, s."desc" AS description, s.url, s.icon, s.cover_img,
              c.key AS category_key, COALESCE(st.heat_score, 0) AS heat_score
         FROM sites s
         JOIN categories c ON c.id = s.category_id
         LEFT JOIN site_stats st ON st.site_id = s.id
        WHERE ${where.join(' AND ')}
        ORDER BY heat_score DESC, c.sort_order ASC, s.sort_order ASC, s.id ASC
        LIMIT ?`,
    )
    .bind(...params, MAX_TOOL_RESULTS)
    .all()

  return (results || []).map((row) => ({
    id: row.id,
    name: row.name,
    desc: row.description || '',
    url: row.url,
    icon: row.icon || 'globe',
    coverImg: row.cover_img || '',
    categoryKey: row.category_key,
  }))
}

/** 会话裁剪：只留 user/assistant、单条 ≤2000 字、最多 10 条（history + messages 合并后取尾部） */
function clampConversation(history, messages) {
  const normalize = (list) => {
    const out = []
    for (const item of Array.isArray(list) ? list : []) {
      if (!item || typeof item !== 'object') continue
      if (item.role !== 'user' && item.role !== 'assistant') continue
      const content = typeof item.content === 'string' ? item.content.trim() : ''
      if (!content) continue
      out.push({ role: item.role, content: [...content].slice(0, MAX_MESSAGE_CHARS).join('') })
    }
    return out
  }
  const past = normalize(history)
  const current = normalize(messages)
  const merged = past.length && current.length ? [...past, ...current] : past.length ? past : current
  return merged.slice(-MAX_MESSAGES)
}

function sseHeaders(request) {
  return {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    ...corsHeaders(request),
  }
}

/** 从一段 SSE 原文里取 data 负载（多行 data 拼接）；无 data 返回 '' */
function extractData(block) {
  const lines = block.split('\n')
  const parts = []
  for (const line of lines) {
    if (line.startsWith('data:')) parts.push(line.slice(5).replace(/^ /, ''))
  }
  return parts.join('\n')
}

/** 累加 tool_calls delta（按 index 归位，arguments 拼接） */
function mergeToolCalls(acc, deltas) {
  const out = acc || []
  for (const delta of deltas) {
    const index = typeof delta.index === 'number' ? delta.index : 0
    if (!out[index]) out[index] = { id: '', name: '', args: '' }
    if (delta.id) out[index].id = delta.id
    if (delta.function) {
      if (delta.function.name) out[index].name = delta.function.name
      if (delta.function.arguments) out[index].args += delta.function.arguments
    }
  }
  return out
}

/** 上游错误信息脱敏（理论上不含 key，仍做二次保险） */
function sanitize(message, key) {
  const text = String(message || '').slice(0, 200)
  return key && text.includes(key) ? text.split(key).join('***') : text
}

async function readUpstreamError(response, key) {
  let detail = ''
  try {
    const text = await response.text()
    try {
      const parsed = JSON.parse(text)
      detail = (parsed.error && (parsed.error.message || parsed.error.msg)) || ''
    } catch {
      detail = text
    }
  } catch {
    /* 忽略读取失败 */
  }
  return sanitize(detail, key)
}

/** 按上游状态码映射错误信封（429 → 429；4xx → 400；其余 → 502），不回传 key */
function upstreamErrorResponse(status, detail, request) {
  if (status === 429) {
    return fail('upstream_rate_limited', 'AI 服务繁忙（上游限流），请稍后再试', request, 429)
  }
  if (status >= 400 && status < 500) {
    return fail(
      'upstream_error',
      detail ? `AI 服务拒绝了本次请求：${detail}` : 'AI 服务拒绝了本次请求',
      request,
      400,
    )
  }
  return fail('upstream_error', 'AI 服务暂不可用，请稍后再试', request, 502)
}

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    if (!isSameOriginRequest(request, request.url)) return sameOriginDenied(request)

    const key = typeof env.GLM_API_KEY === 'string' ? env.GLM_API_KEY.trim() : ''
    if (!key) return fail('ai_unavailable', 'AI 服务未配置', request, 503)

    const db = getDb(env)
    // 限流先于解析：滥用/畸形请求同样计数（超限 429，不影响主站任何功能）
    const limited = await overTrackLimit(db, clientIp(request), 'ai', AI_LIMIT_PER_MINUTE)
    if (limited) {
      return fail('rate_limited', '提问太频繁了，请 1 分钟后再试', request, 429)
    }

    const body = (await readJson(request)) || {}
    const conversation = clampConversation(body.history, body.messages)
    if (conversation.length === 0) {
      return fail('invalid_request', 'messages 至少需要 1 条有效消息', request, 400)
    }

    const model = (typeof env.GLM_MODEL === 'string' && env.GLM_MODEL.trim()) || DEFAULT_MODEL
    const baseMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...conversation]

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

    const callUpstream = (payload) =>
      fetch(GLM_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        // model 统一在此注入：第二段（tool 回传）漏传会得到 GLM 的 {"error":{"code":"500"}} 空流
        body: JSON.stringify({ model, ...payload }),
        signal: controller.signal,
      })

    let upstream
    try {
      upstream = await callUpstream({
        model,
        messages: baseMessages,
        tools: TOOLS,
        stream: true,
        temperature: 0.5,
      })
    } catch (error) {
      clearTimeout(timer)
      const timedOut = error && (error.name === 'AbortError' || error.name === 'TimeoutError')
      return timedOut
        ? fail('upstream_timeout', 'AI 服务响应超时，请稍后再试', request, 503)
        : fail('upstream_error', 'AI 服务连接失败，请稍后再试', request, 502)
    }

    if (!upstream.ok) {
      clearTimeout(timer)
      const detail = await readUpstreamError(upstream, key)
      return upstreamErrorResponse(upstream.status, detail, request)
    }
    if (!upstream.body) {
      clearTimeout(timer)
      return fail('upstream_error', 'AI 服务未返回数据流', request, 502)
    }

    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()
    const send = async (text) => {
      try {
        await writer.write(encoder.encode(text))
      } catch {
        /* 客户端已断开：忽略 */
      }
    }

    const relay = async () => {
      try {
        const sites = await relayTwoStage({ upstream, baseMessages, callUpstream, db, send })
        if (sites) {
          await send(`event: recommend\ndata: ${JSON.stringify({ sites })}\n\n`)
        }
        await send('data: [DONE]\n\n')
      } catch (error) {
        const timedOut = error && (error.name === 'AbortError' || error.name === 'TimeoutError')
        await send(
          `event: error\ndata: ${JSON.stringify({
            ok: false,
            error: {
              code: timedOut ? 'upstream_timeout' : 'upstream_error',
              message: timedOut ? 'AI 服务响应超时，请重试' : 'AI 服务中途异常，请重试',
            },
          })}\n\n`,
        )
        await send('data: [DONE]\n\n')
      } finally {
        clearTimeout(timer)
        try {
          await writer.close()
        } catch {
          /* 已关闭 */
        }
      }
    }

    // 客户端中途断开（如点「停止」）→ 同步中断上游，避免空烧 token
    try {
      request.signal.addEventListener('abort', () => controller.abort())
    } catch {
      /* 运行时无 signal：忽略 */
    }

    relay()
    return new Response(readable, { status: 200, headers: sseHeaders(request) })
  } catch (error) {
    return errorResponse(error, request)
  }
}

/**
 * 两段式流式中继
 * @returns {Promise<Array|null>} tool 执行得到的推荐站点（第二段结束时返回，供 recommend 事件）；
 *   未调用 tool 返回 null（不发 recommend）
 */
async function relayTwoStage({ upstream, baseMessages, callUpstream, db, send }) {
  const decoder = new TextDecoder()
  const reader = upstream.body.getReader()
  let buffer = ''
  let toolCalls = null
  let forwarding = false

  const handleBlock = async (raw) => {
    const data = extractData(raw)
    if (!data) return { done: false }
    if (data === '[DONE]') {
      // 不在这里转发：由 relay() 统一在 recommend 之后发唯一一个 [DONE]，保证事件顺序
      return { done: true }
    }
    let parsed = null
    try {
      parsed = JSON.parse(data)
    } catch {
      if (forwarding) await send(raw + '\n\n')
      return { done: false }
    }
    const choice = parsed && parsed.choices && parsed.choices[0]
    const delta = choice && choice.delta
    if (delta && Array.isArray(delta.tool_calls) && delta.tool_calls.length) {
      // 命中 tool_calls：立刻停止转发（首帧即含 tool_calls，此时尚未转发任何内容）
      toolCalls = mergeToolCalls(toolCalls, delta.tool_calls)
      forwarding = false
      return { done: false }
    }
    if (!toolCalls && delta && typeof delta.content === 'string' && delta.content) {
      forwarding = true
    }
    if (forwarding) await send(raw + '\n\n')
    return { done: false }
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let index = buffer.indexOf('\n\n')
    while (index >= 0) {
      const block = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      const result = await handleBlock(block)
      if (result.done) {
        buffer = ''
        break
      }
      index = buffer.indexOf('\n\n')
    }
  }

  const toolCall = (toolCalls || []).find((item) => item && item.name === 'search_food_sites')
  if (!toolCall) {
    // 无 tool：第一段内容已透传，recommend 事件不发
    return null
  }

  // 执行检索（失败降级为空数组，模型会如实说明）
  let sites = []
  try {
    let args = {}
    try {
      args = JSON.parse(toolCall.args || '{}')
    } catch {
      args = {}
    }
    sites = await searchFoodSites(db, {
      query: typeof args.query === 'string' ? args.query : '',
      category: typeof args.category === 'string' ? args.category : '',
    })
  } catch {
    sites = []
  }

  const toolCallId = toolCall.id || 'call_1'
  const second = await callUpstream({
    messages: [
      ...baseMessages,
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: toolCallId,
            type: 'function',
            function: { name: toolCall.name, arguments: toolCall.args || '{}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: toolCallId, content: JSON.stringify(sites) },
    ],
    stream: true,
    temperature: 0.5,
  })

  if (!second.ok) {
    // 第二段失败：交给 relay() 发 event: error（消息固定文案，不带上游细节/密钥）
    throw new Error(`GLM stage2 failed with status ${second.status}`)
  }
  if (!second.body) {
    throw new Error('GLM stage2 returned no body')
  }

  const reader2 = second.body.getReader()
  let buffer2 = ''
  for (;;) {
    const { value, done } = await reader2.read()
    if (done) break
    buffer2 += decoder.decode(value, { stream: true })
    let index = buffer2.indexOf('\n\n')
    while (index >= 0) {
      const block = buffer2.slice(0, index)
      buffer2 = buffer2.slice(index + 2)
      const data = extractData(block)
      if (data === '[DONE]') {
        buffer2 = ''
        break
      }
      await send(block + '\n\n')
      index = buffer2.indexOf('\n\n')
    }
  }

  return sites
}
