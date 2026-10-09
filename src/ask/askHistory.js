/**
 * M8/M10 · 本地记忆会话（零依赖、纯 localStorage）
 * 键 food-nav:ask-history → M10 结构 { savedAt, sessions: [ {id, savedAt, messages}, ... ] }
 * （最新在前，最多 MAX_SESSIONS=10 条）；M8 旧结构 { savedAt, messages } 读取时归一为单条会话
 * （id = savedAt），首次写入即落 M10 结构。
 * 目的：刷新/误关不丢对话；「清空对话」= 删除全部会话（removeItem）；M10 支持单条删除。
 * 规则：
 *  - 单会话：过滤无 content 项 → 只存最近 20 条 → 每条 {id, role, content, status:'done', sites}
 *    （清掉 streaming/stopped/error 标记与 showSuggestions 等运行态字段）→ 空列表视为删除该会话
 *  - 结构校验（数组、每项 role ∈ {user, assistant}、content 字符串）→ 坏数据/解析异常一律静默
 *    返回（绝不抛错打断渲染）
 */

/** 唯一键（AskPage 写入 / 工作台读取 / 跨标签 storage 事件共用） */
export const ASK_HISTORY_KEY = 'food-nav:ask-history'

/** 单会话保留的最近消息条数 */
const MAX_ITEMS = 20

/** 会话条数上限（M10 新增，超出截断最旧的一条） */
export const MAX_SESSIONS = 10

/** 单条结构校验：role 合法 + content 为字符串 */
function isValidMessage(item) {
  return (
    item !== null &&
    typeof item === 'object' &&
    (item.role === 'user' || item.role === 'assistant') &&
    typeof item.content === 'string'
  )
}

/** 读路径归一：只还原渲染所需字段（丢弃 showSuggestions / error 等运行态），status 统一 done */
function normalizeMessages(list) {
  if (!Array.isArray(list) || list.length === 0 || !list.every(isValidMessage)) return null
  return list.map((item, index) => ({
    id: Number.isFinite(Number(item.id)) ? Number(item.id) : index + 1,
    role: item.role,
    content: item.content,
    status: 'done',
    sites: Array.isArray(item.sites) ? item.sites : [],
  }))
}

/** 会话结构校验 → 合法返回 {id, savedAt, messages}，否则 null */
function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null
  const messages = normalizeMessages(raw.messages)
  if (!messages) return null
  const id = Number(raw.id) || Number(raw.savedAt) || 0
  if (!id) return null
  return { id, savedAt: Number(raw.savedAt) || id, messages }
}

/** 落盘（空列表 = removeItem）并 clamp 10 条；配额满/隐私模式静默，绝不影响问答 */
function persistSessions(sessions) {
  try {
    const list = sessions.slice(0, MAX_SESSIONS)
    if (!list.length) {
      window.localStorage.removeItem(ASK_HISTORY_KEY)
      return
    }
    window.localStorage.setItem(ASK_HISTORY_KEY, JSON.stringify({ savedAt: Date.now(), sessions: list }))
  } catch {
    /* 静默 */
  }
}

/** 写路径归一：过滤无 content → 最近 20 条 → 清运行态标记 */
function prepareMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string' &&
        item.content.trim() !== '',
    )
    .slice(-MAX_ITEMS)
    .map((item) => ({
      id: Number(item.id) || 0,
      role: item.role,
      content: item.content,
      status: 'done',
      sites: Array.isArray(item.sites) ? item.sites : [],
    }))
}

/** 读全部会话：新旧结构归一 → 去重 → 最多 MAX_SESSIONS 条；坏数据/异常返回 [] */
export function readSessions() {
  try {
    const raw = window.localStorage.getItem(ASK_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return []
    const list = Array.isArray(parsed.sessions)
      ? parsed.sessions
      : [{ id: parsed.savedAt, savedAt: parsed.savedAt, messages: parsed.messages }]
    const sessions = []
    const seen = new Set()
    for (const item of list) {
      const session = normalizeSession(item)
      if (!session || seen.has(session.id)) continue
      seen.add(session.id)
      sessions.push(session)
      if (sessions.length >= MAX_SESSIONS) break
    }
    return sessions
  } catch {
    return []
  }
}

/** 读最新一条会话的 messages（AskPage 恢复入口，语义与 M8 一致）：无/坏数据 → null */
export function readAskHistory() {
  const sessions = readSessions()
  return sessions.length ? sessions[0].messages : null
}

/**
 * 写历史：upsert 一条会话（sessionId 匹配 → 原地更新并提到最前；无 → 新建），
 * clamp 10 条；空 messages → 删除该会话；返回本次会话 id（无写入返回 null）
 */
export function writeAskHistory(messages, sessionId) {
  try {
    const list = prepareMessages(messages)
    const sessions = readSessions()
    const id = sessionId === null || sessionId === undefined ? null : Number(sessionId) || null

    if (list.length === 0) {
      // 无会话可删（null id）→ 不动存储；有 id → 删除该条
      if (id === null) return null
      persistSessions(sessions.filter((session) => session.id !== id))
      return null
    }

    const nextId = id === null ? Date.now() : id
    const rest = sessions.filter((session) => session.id !== nextId)
    persistSessions([{ id: nextId, savedAt: Date.now(), messages: list }, ...rest])
    return nextId
  } catch {
    return null
  }
}

/** 删除单条会话（M10 新增）→ 成功返回 true；不存在/异常返回 false */
export function removeSession(id) {
  try {
    const target = Number(id)
    if (!Number.isFinite(target) || !target) return false
    const sessions = readSessions()
    const rest = sessions.filter((session) => session.id !== target)
    if (rest.length === sessions.length) return false
    persistSessions(rest)
    return true
  } catch {
    return false
  }
}

/** 清历史（清空对话闭环：删除全部会话） */
export function clearAskHistory() {
  try {
    window.localStorage.removeItem(ASK_HISTORY_KEY)
  } catch {
    /* 静默 */
  }
}
