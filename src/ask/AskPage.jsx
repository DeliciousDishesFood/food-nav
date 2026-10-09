/**
 * M6 · AI 问答页容器（src/ask/ 独立模块，懒加载 chunk）
 * 职责：会话状态、调用同源 /api/ai/chat（POST + SSE 流式）、50ms 节流渲染、
 *      解析自定义 event: recommend / event: error、停止（AbortController）、清空对话。
 * 零耦合：不 import 任何主站组件（仅使用 tailwind 设计 token）。
 * M6 变更仅在布局与视觉（桌面双栏 / 暖纸面 / overflow-x-hidden）；
 * SSE 解析、节流、Abort、停止、推荐等交互逻辑一行未动。
 * M8 变更（只动布局与品牌，SSE / 停止 / 推荐 / 发送逻辑零改动）：
 *  - 空态 → AskWorkspace 三列工作台；有消息 → 纯净单栏 AskChat（aside 彻底移除）
 *  - header：删分隔线、grid 三列真居中、返回/清空改 SVG 图标按钮（aria-label 字面保留）
 *  - 品牌「✨ 食光 AI 问答」→「樱见」；本地记忆会话（askHistory：800ms debounce + 卸载 flush）
 * M10 变更（SSE 解析 / 节流 / Abort / 上下文逻辑一行未动，只加入口与状态机）：
 *  - AI 推荐闭环：AskCard 主体点击 → handleAskSite → 复用 send() 追问当前会话（带站点上下文）
 *  - 对话态 header 新增「返回工作台」（flush 历史后回到工作台，会话保留不清空）
 *  - 会话多条化：bootSession 恢复最新一条、writeAskHistory 带 sessionId、工作台可单条删除
 *  - view 状态机（workspace | chat）：返回工作台 = 保留 messages 只切视图；清空/删除当前 = 归零
 * task-23 变更（SSE / Abort / 推荐 / 发送链路零改动）：
 *  - header 右格新增 History 图标浮层（AskHistoryMenu：恢复 / 单条删除最近会话）
 *  - 工作台极简化：删今日美味/最近会话静态面板，单列居中（AskComposer 注入空态列，对话态仍在页底）
 */
import { useEffect, useRef, useState } from 'react'
import AskChat from './AskChat.jsx'
import AskComposer from './AskComposer.jsx'
import AskWorkspace, { SakuraLogo } from './AskWorkspace.jsx'
import AskHistoryMenu from './AskHistoryMenu.jsx'
import { readSessions, removeSession, writeAskHistory } from './askHistory.js'
import '../styles/ask-theme.css'

/** 会话上下文上限（与服务端 clamp 一致） */
const MAX_TURNS = 10
/** 流式渲染节流：50ms flush 一次 setState，避免每 token 一渲染 */
const FLUSH_MS = 50

/** 从 #/ask?q=xxx 取预填问题（可选特性） */
function readPrefill() {
  try {
    const hash = window.location.hash || ''
    const index = hash.indexOf('?')
    if (index < 0) return ''
    const params = new URLSearchParams(hash.slice(index + 1))
    return (params.get('q') || '').slice(0, 200)
  } catch {
    return ''
  }
}

/** 解析 SSE 字节流 → 逐事件回调 */
async function readSse(body, { onContent, onRecommend, onError }) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false

  while (!finished) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let index = buffer.indexOf('\n\n')
    while (index >= 0) {
      const block = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)

      let event = 'message'
      const dataLines = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
      }

      if (dataLines.length) {
        const data = dataLines.join('\n')
        if (data === '[DONE]') {
          finished = true
          break
        }
        if (event === 'recommend') {
          try {
            const payload = JSON.parse(data)
            onRecommend(Array.isArray(payload.sites) ? payload.sites : [])
          } catch {
            /* 忽略坏包 */
          }
        } else if (event === 'error') {
          try {
            const payload = JSON.parse(data)
            onError(payload?.error?.message || 'AI 服务中途异常，请重试')
          } catch {
            onError('AI 服务中途异常，请重试')
          }
        } else {
          try {
            const payload = JSON.parse(data)
            const delta = payload?.choices?.[0]?.delta?.content
            if (typeof delta === 'string' && delta) onContent(delta)
          } catch {
            /* 忽略非 JSON 块 */
          }
        }
      }
      index = buffer.indexOf('\n\n')
    }
  }
}

export default function AskPage() {
  // M10 多会话：一次读取拿到最新一条（顺带作为视图与 sessionId 的初值）
  const [bootSession] = useState(() => readSessions()[0] || null)
  // M8 本地记忆会话：挂载即恢复上次对话（刷新/误关不丢）；无历史或坏数据 → []
  const [messages, setMessages] = useState(() => (bootSession ? bootSession.messages : []))
  // M10 视图状态机：workspace = 工作台；chat = 对话流（返回工作台只切视图，messages 保留）
  const [view, setView] = useState(() => (bootSession ? 'chat' : 'workspace'))
  const [draft, setDraft] = useState(() => readPrefill())
  const [streaming, setStreaming] = useState(false)
  const controllerRef = useRef(null)
  // M10 当前会话 id：写入/删除都挂在这一条上；清空对话或删当前会话时归 null（下次写新建）
  const sessionIdRef = useRef(bootSession ? bootSession.id : null)
  // 同一个 id 的渲染态镜像（工作台「当前会话」标记用；渲染期不读 ref）
  const [activeSessionId, setActiveSessionId] = useState(() =>
    bootSession ? bootSession.id : null,
  )
  const syncSessionId = (id) => {
    sessionIdRef.current = id
    setActiveSessionId(id)
  }
  // 恢复消息的 id 可能很大 → idRef 从历史最大 id 起算，否则新消息 id 撞历史 id
  //（patchMessage 会误改恢复的旧气泡）
  const idRef = useRef(messages.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0))
  const messagesRef = useRef(messages)
  const initialMessagesRef = useRef(messages) // 首帧快照：与之相同 → 初始恢复不写
  const pendingWriteRef = useRef(false) // 是否存在未落盘的会话变更（卸载 flush 用）

  const patchMessage = (id, patch) => {
    setMessages((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  // 记忆会话：messages 变化 → 800ms debounce 写入（流式每 50ms 变化只重置计时器，
  // 天然防狂写）；初始恢复的数组与快照相同 → 不写；卸载 flush 见下方 effect
  useEffect(() => {
    messagesRef.current = messages
    if (messages === initialMessagesRef.current) return undefined
    pendingWriteRef.current = true
    const timer = setTimeout(() => {
      pendingWriteRef.current = false
      const id = writeAskHistory(messages, sessionIdRef.current)
      if (id) syncSessionId(id)
    }, 800)
    return () => clearTimeout(timer)
  }, [messages])

  // 卸载 flush：有未落盘的会话变更则立即写，避免 800ms 内切页/关页丢对话
  useEffect(
    () => () => {
      if (pendingWriteRef.current) {
        const id = writeAskHistory(messagesRef.current, sessionIdRef.current)
        if (id) sessionIdRef.current = id
      }
    },
    [],
  )

  const goHome = () => {
    window.location.hash = '#/'
  }

  const stop = () => {
    if (controllerRef.current) controllerRef.current.abort()
  }

  const clear = () => {
    if (controllerRef.current) controllerRef.current.abort()
    // M10：清空 = 删除当前这一条会话（面板里其它会话保留）；对话归零、回到工作台
    if (sessionIdRef.current) removeSession(sessionIdRef.current)
    syncSessionId(null)
    setMessages([])
    idRef.current = 0
    setView('workspace')
  }

  /**
   * M10 对话态 → 返回工作台：保留当前会话（与「清空对话」的删除语义相对）——
   * 立即 flush 落盘（不等 800ms debounce）→ 内存归零并切视图；
   * 会话进「最近会话」面板，可从面板「继续对话」整段恢复（messages/idRef 同步还原）
   */
  const backToWorkspace = () => {
    // 先把当前会话整段写进面板（flush，不等 800ms debounce），再把内存与「当前会话」归零：
    // 会话以可继续/可删除的条目留在「最近会话」，新提问即开新会话（多会话自然累积）
    writeAskHistory(messagesRef.current, sessionIdRef.current)
    pendingWriteRef.current = false
    syncSessionId(null)
    setMessages([])
    idRef.current = 0
    setView('workspace')
  }

  /**
   * M10 工作台「继续上次对话」：恢复整段历史并续接 id（滚底由 AskChat 的 messages effect 兜底）
   * 入参为会话对象 {id, messages}（也兼容旧的纯数组调用）
   */
  const resume = (session) => {
    const list = Array.isArray(session) ? session : session && session.messages
    if (!Array.isArray(list) || list.length === 0) return
    if (!Array.isArray(session)) syncSessionId(Number(session.id) || null)
    setMessages(list)
    idRef.current = list.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0)
    setView('chat')
  }

  /** M10 最近会话单条删除：localStorage 同步 + 当前会话被删时归零内存，避免状态错乱 */
  const handleRemoveSession = (id) => {
    if (!removeSession(id)) return
    if (Number(id) !== Number(sessionIdRef.current)) return
    if (controllerRef.current) controllerRef.current.abort()
    syncSessionId(null)
    idRef.current = 0
    setMessages([])
    setView('workspace')
  }

  /** M10 AI 推荐闭环：推荐卡主体点击 → 复用既有发送链路追当前会话（不新起会话） */
  const handleAskSite = (site) => {
    if (!site || streaming) return
    send(`这个站点「${site.name}」看起来不错，帮我介绍一下它的特色，适合什么样的人用。`)
  }

  const send = async (rawText) => {
    const text = String(rawText || '').trim()
    if (!text || streaming) return
    setView('chat')

    const history = messages
      .filter((item) => (item.role === 'user' || item.role === 'assistant') && item.content)
      .map((item) => ({ role: item.role, content: item.content }))
    const payload = [...history, { role: 'user', content: text }].slice(-MAX_TURNS)

    const userId = (idRef.current += 1)
    const aiId = (idRef.current += 1)
    const isFirstAnswer = !history.some((item) => item.role === 'assistant')

    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', content: text, status: 'done' },
      { id: aiId, role: 'assistant', content: '', sites: [], status: 'streaming' },
    ])
    setDraft('')
    setStreaming(true)

    const controller = new AbortController()
    controllerRef.current = controller

    let buffered = ''
    let timer = null
    let recommended = []
    let streamError = ''

    const flushNow = () => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      patchMessage(aiId, { content: buffered })
    }
    const schedule = () => {
      if (timer !== null) return
      timer = setTimeout(() => {
        timer = null
        patchMessage(aiId, { content: buffered })
      }, FLUSH_MS)
    }

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: payload }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        let message = 'AI 服务开小差了，请稍后再试'
        try {
          const payloadJson = await response.json()
          message = payloadJson?.error?.message || message
        } catch {
          /* 非 JSON 错误体 */
        }
        flushNow()
        patchMessage(aiId, { status: 'error', error: message, showSuggestions: false })
        return
      }

      await readSse(response.body, {
        onContent: (delta) => {
          buffered += delta
          schedule()
        },
        onRecommend: (sites) => {
          recommended = sites.slice(0, 6)
        },
        onError: (message) => {
          streamError = message
        },
      })

      flushNow()
      if (streamError) {
        patchMessage(aiId, {
          status: 'error',
          error: streamError,
          sites: recommended,
          showSuggestions: false,
        })
      } else {
        patchMessage(aiId, {
          status: 'done',
          sites: recommended,
          showSuggestions: isFirstAnswer,
        })
      }
    } catch (error) {
      flushNow()
      if (error && error.name === 'AbortError') {
        patchMessage(aiId, { status: 'stopped', showSuggestions: false })
      } else {
        patchMessage(aiId, {
          status: 'error',
          error: '网络异常，请检查连接后重试',
          showSuggestions: false,
        })
      }
    } finally {
      if (timer !== null) clearTimeout(timer)
      controllerRef.current = null
      setStreaming(false)
    }
  }

  const handleSuggest = (text) => {
    if (!streaming) send(text)
  }

  // 输入框：空态 = 注入工作台单列（插画→问候→输入框→chips）；对话态 = 页底固定条
  const composer = (
    <AskComposer
      value={draft}
      onChange={setDraft}
      onSend={send}
      onStop={stop}
      streaming={streaming}
      disabled={false}
    />
  )

  return (
    <div className="ask-page flex h-[100dvh] min-h-[520px] flex-col">
      {/* relative z-50：header 胶囊自带 backdrop-blur（层叠上下文），History 浮层 z-50 需要
          整个 header 高于对话区，否则浮层会被下方聊天气泡按 DOM 顺序盖住 */}
      <header className="relative z-50 shrink-0">
        <div className="mx-auto w-full max-w-6xl px-4">
          {/* M8：三列 grid 真居中（左图标 / 中标题 / 右图标），悬浮胶囊容器原样保留 */}
          <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-[20px] border border-white/85 bg-white/70 px-3 py-2 backdrop-blur-md dark:border-white/10 dark:bg-[#241A33]/75">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={goHome}
                aria-label="回到主站"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/90 bg-white/80 text-food-dark shadow-[0_4px_14px_rgba(244,114,182,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:text-food-primary focus:outline-none focus-visible:shadow-foodFocus dark:border-white/10 dark:bg-[#2C2140]/85"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 12H5" />
                  <path d="m12 19-7-7 7-7" />
                </svg>
              </button>

              {/* M10 对话态专属：返回工作台 = 保留当前会话进面板；生成中不可返回（与清空同样禁用） */}
              {view === 'chat' && messages.length > 0 ? (
                <button
                  type="button"
                  onClick={backToWorkspace}
                  disabled={streaming}
                  aria-label="返回工作台"
                  title={streaming ? '生成中，先停止再返回工作台' : '返回工作台'}
                  className="flex h-9 min-w-0 shrink items-center gap-1.5 rounded-full border border-white/90 bg-white/80 px-2.5 font-rounded text-xs font-medium whitespace-nowrap text-food-dark shadow-[0_4px_14px_rgba(244,114,182,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:text-food-primary focus:outline-none focus-visible:shadow-foodFocus disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 dark:border-white/10 dark:bg-[#2C2140]/85"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="7" height="7" rx="1.6" />
                    <rect x="14" y="3" width="7" height="7" rx="1.6" />
                    <rect x="3" y="14" width="7" height="7" rx="1.6" />
                    <rect x="14" y="14" width="7" height="7" rx="1.6" />
                  </svg>
                  <span className="truncate">返回工作台</span>
                </button>
              ) : null}
            </div>

            <div className="flex min-w-0 items-center justify-center gap-1.5">
              <SakuraLogo className="h-6 w-6" />
              <span className="min-w-0 truncate font-display text-base text-food-dark sm:text-card-title">
                樱见
              </span>
            </div>

            {/* task-23：History 图标浮层（最近会话）+ 清空对话，成组放右格 */}
            <div className="flex items-center justify-end gap-2">
              <AskHistoryMenu
                onResume={resume}
                onRemoveSession={handleRemoveSession}
                activeSessionId={messages.length > 0 ? activeSessionId : null}
              />
              <button
                type="button"
                onClick={clear}
                disabled={messages.length === 0 || streaming}
                aria-label="清空对话"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/90 bg-white/80 text-food-muted shadow-[0_4px_14px_rgba(244,114,182,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:text-food-primary focus:outline-none focus-visible:shadow-foodFocus disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 dark:border-white/10 dark:bg-[#2C2140]/85"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* M8：工作台 = 三列布局（移动端单列堆叠、可滚动）；对话态 = 纯净单栏 AskChat。
          M10：由 view 决定（返回工作台保留 messages，只切视图），messages 为空兜底回工作台 */}
      {view === 'chat' && messages.length > 0 ? (
        <>
          <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 px-4 pt-4">
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
              <AskChat messages={messages} onSuggest={handleSuggest} onAskSite={handleAskSite} />
            </main>
          </div>
          {composer}
        </>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col">
          <AskWorkspace onSuggest={handleSuggest}>{composer}</AskWorkspace>
        </main>
      )}
    </div>
  )
}
