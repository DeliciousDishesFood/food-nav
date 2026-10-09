/**
 * task-23 · header「历史对话」图标浮层（最近会话从工作台面板收进 header）
 *  - 图标：lucide History（经 Morphicon，与既有 SVG 图标按钮同尺寸 h-9），aria-label="历史对话"
 *  - 浮层：absolute right-0 top-full mt-2 z-50 玻璃面板（bg-food-surface + backdrop-blur + border）
 *  - 每条 = savedAt 时间 + 首条消息预览（截断 20 字）；点击 → 复用 AskPage resume 恢复会话
 *  - 每条右侧 Trash2 单条删除（复用 AskPage handleRemoveSession → removeSession），删除后即时刷新
 *  - 空历史 → 「还没有对话记录 🌸」；点击浮层/按钮外部关闭（忽略浮层自身与按钮点击）
 *  - view=chat 也渲染（AskPage 恒定挂载），任何时候可看历史
 */
import { useEffect, useRef, useState } from 'react'
import { MorphIcon } from 'morphicons/react'
import { History, Trash2 } from 'lucide'
import { ASK_HISTORY_KEY, readSessions } from './askHistory.js'

/** 预览截断（首条消息 20 字） */
function clip(text, max = 20) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** savedAt → MM-DD HH:mm（本地时区） */
function formatSavedAt(savedAt) {
  try {
    return new Date(savedAt).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return ''
  }
}

export default function AskHistoryMenu({ onResume, onRemoveSession, activeSessionId = null }) {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState([])
  const rootRef = useRef(null)

  const refresh = () => setSessions(readSessions())

  const toggle = () => {
    const next = !open
    // 打开时在事件里读最新（backToWorkspace / 发送落盘后重开即见），不进 effect（防 setState-in-effect）
    if (next) setSessions(readSessions())
    setOpen(next)
  }

  // 点击浮层与 History 按钮外部 → 关闭（header 其它按钮点按时自动收起）
  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (event) => {
      const root = rootRef.current
      if (root && root.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [open])

  // 跨标签写入/清除历史时同步
  useEffect(() => {
    const onStorage = (event) => {
      if (!event.key || event.key === ASK_HISTORY_KEY) refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const handleRemove = (id) => {
    onRemoveSession(id)
    setSessions(readSessions())
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="历史对话"
        aria-expanded={open}
        title="历史对话"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/90 bg-white/80 text-food-muted shadow-[0_4px_14px_rgba(244,114,182,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:text-food-primary focus:outline-none focus-visible:shadow-foodFocus dark:border-white/10 dark:bg-[#2C2140]/85"
      >
        <MorphIcon icon={History} size={16} strokeWidth={1.8} />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-32px)] rounded-2xl border-2 border-food-line bg-food-surface p-2 shadow-foodSticker backdrop-blur-md">
          <p className="px-2 pb-1.5 pt-1 font-rounded text-xs font-bold text-food-muted">
            历史对话
          </p>
          {sessions.length > 0 ? (
            <ul className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto">
              {sessions.map((session) => {
                const isActive = activeSessionId !== null && session.id === activeSessionId
                const preview = clip((session.messages[0] && session.messages[0].content) || '')
                return (
                  <li
                    key={session.id}
                    className="flex items-center gap-1 rounded-xl border border-food-line bg-food-tagBg px-2 py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onResume(session)
                        setOpen(false)
                      }}
                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-lg px-1 py-0.5 text-left transition-colors hover:text-food-primary focus:outline-none focus-visible:shadow-foodFocus"
                    >
                      <span className="flex w-full min-w-0 items-center gap-1.5">
                        {isActive ? (
                          <span className="shrink-0 rounded-full bg-food-tagBg px-1.5 py-px text-[10px] font-bold text-food-primary">
                            当前
                          </span>
                        ) : null}
                        <span className="shrink-0 text-[11px] text-food-muted">
                          {formatSavedAt(session.savedAt)}
                        </span>
                      </span>
                      <span className="w-full min-w-0 truncate font-rounded text-xs font-medium text-food-dark">
                        {preview || '（空对话）'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(session.id)}
                      aria-label="删除会话"
                      title="删除会话"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-food-muted transition-all duration-200 hover:bg-white/80 hover:text-food-primary focus:outline-none focus-visible:shadow-foodFocus dark:hover:bg-white/10"
                    >
                      <MorphIcon icon={Trash2} size={15} strokeWidth={1.8} />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-2 py-3 text-center font-rounded text-xs text-food-muted">
              还没有对话记录 🌸
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
