/**
 * M8 · AI 页工作台（空态，新建文件）
 * AskPage 在 messages.length === 0 时渲染本组件；发出第一条消息后整块卸载，
 * 切换为纯净单栏 AskChat（桌面 3 列 → 单列，aside 已彻底移除）。
 * 布局：桌面 lg:grid-cols-3 —— 左大卡（插画/标题/问候/灵感 chips，col-span-2）
 *      + 右列（今日美味 + 最近会话，col-span-1）；移动端单列堆叠、外层可滚动。
 * 零耦合：不 import 任何主站组件；chips / 今日美味数据取静态快照（禁新接口）。
 * M10：最近会话面板多条化（最多 10 条）+ 每条 Trash2 单条删除（aria-label=删除会话）；
 *     「当前会话」不可从面板删除（用 header「清空对话」），避免内存/存储状态错乱。
 */
import { useEffect, useMemo, useState } from 'react'
import { CATEGORY_EMOJI, pickChips, pickDailySites, pickGreeting } from './askCopy.js'
import { ASK_HISTORY_KEY, readSessions } from './askHistory.js'

/** 樱见品牌小 logo：渐变底圆角方块 + 白色樱花五瓣（header 与工作台共用） */
export function SakuraLogo({ className = 'h-6 w-6' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF8FB1] to-[#FFB6CD] shadow-[0_2px_8px_rgba(244,114,182,0.35)] ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" fill="none">
        <g fill="#ffffff">
          {[0, 72, 144, 216, 288].map((deg) => (
            <path
              key={deg}
              d="M12 12c-2.5-1.7-3.2-5.1-.7-7.9.4-.5 1.2-.5 1.6 0 2.5 2.8 1.8 6.2-.9 7.9z"
              transform={`rotate(${deg} 12 12)`}
            />
          ))}
        </g>
        <circle cx="12" cy="12" r="1.6" fill="#FF6B9D" />
      </svg>
    </span>
  )
}

/** 品牌插画（原 AskChat 空态插画迁入，禁 import 主站组件） */
function AskIllustration() {
  return (
    <svg viewBox="0 0 240 150" className="h-24 w-36" role="img" aria-label="樱见插画">
      <defs>
        <linearGradient id="ask-art-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFEFF6" />
          <stop offset="60%" stopColor="#F7F0FF" />
          <stop offset="100%" stopColor="#EAF4FF" />
        </linearGradient>
        <linearGradient id="ask-art-bowl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#FFF0F5" />
        </linearGradient>
      </defs>
      <rect x="6" y="8" width="228" height="134" rx="28" fill="url(#ask-art-sky)" />
      <circle cx="44" cy="42" r="16" fill="#FFFFFF" opacity="0.7" />
      <circle cx="196" cy="112" r="22" fill="#FFFFFF" opacity="0.55" />
      <path d="M186 34l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#FFC94D" />
      <path d="M52 104l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#FFB7D0" />
      <g fill="none" stroke="#FF8FB8" strokeWidth="5" strokeLinecap="round" opacity="0.7">
        <path d="M96 62c10-12-9-22 2-34" />
        <path d="M124 58c10-12-9-22 2-34" />
        <path d="M152 62c10-12-9-22 2-34" />
      </g>
      <path
        d="M74 76h92l-8 34a20 20 0 0 1-20 16H102a20 20 0 0 1-20-16z"
        fill="url(#ask-art-bowl)"
        stroke="#FF6B9D"
        strokeWidth="4"
      />
      <path
        d="M68 70h104a7 7 0 0 1 0 14H68a7 7 0 0 1 0-14z"
        fill="#FFE1EC"
        stroke="#FF6B9D"
        strokeWidth="4"
      />
      <g stroke="#4B3A55" strokeWidth="4" strokeLinecap="round">
        <path d="M104 96c4 6 12 6 16 0" />
        <path d="M134 96c4 6 12 6 16 0" />
      </g>
      <g fill="#FFFFFF" opacity="0.9">
        <circle cx="176" cy="52" r="4" />
        <circle cx="64" cy="66" r="3" />
      </g>
    </svg>
  )
}

/** 文案截断（最近会话摘要，最多 24 字） */
function clip(text, max = 24) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** 取会话里最后一条用户消息（列表摘要用） */
function lastUserOf(messages) {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i]
    if (item && item.role === 'user' && item.content) return item.content
  }
  return ''
}

/** Trash2（lucide 风格，手绘 SVG：零新依赖） */
function Trash2Icon({ className = 'h-4 w-4' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
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
  )
}

/**
 * 最近会话面板（M10 多条化）：
 *  每条 = 摘要（可点击恢复该会话）+ Trash2 单条删除；删空 → 轻引导；
 *  「当前会话」行只读不可删（提示走 header 清空），避免删掉正在展示的对话。
 */
function RecentSession({ onResume, activeSessionId, onRemoveSession }) {
  const [sessions, setSessions] = useState(() => readSessions())

  // 跨标签写入/清除历史时同步（storage 事件只在其他文档触发，本页不受自写干扰）
  useEffect(() => {
    const onStorage = (event) => {
      if (!event.key || event.key === ASK_HISTORY_KEY) setSessions(readSessions())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // 单条删除：AskPage 落盘后重读，面板即时更新（本页写入不触发 storage 事件）
  const handleRemove = (id) => {
    onRemoveSession(id)
    setSessions(readSessions())
  }

  return (
    <div className="ask-panel ask-soft rounded-[22px] p-3.5">
      <p className="mb-2 font-rounded text-control font-bold text-food-dark">最近会话</p>
      {sessions.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {sessions.map((session) => {
            const isActive = activeSessionId !== null && session.id === activeSessionId
            const summary = clip(lastUserOf(session.messages)) || '（空对话）'
            return (
              <li
                key={session.id}
                className="flex items-center gap-1.5 rounded-2xl border border-white/70 bg-white/60 px-2 py-1.5 dark:border-white/10 dark:bg-white/5"
              >
                <button
                  type="button"
                  onClick={() => onResume(session)}
                  className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-xl px-1 py-0.5 text-left transition-colors hover:text-food-primary focus:outline-none focus-visible:shadow-foodFocus"
                >
                  <span className="flex w-full min-w-0 items-center gap-1.5">
                    {isActive ? (
                      <span className="shrink-0 rounded-full bg-food-tagBg px-1.5 py-px text-[10px] font-bold text-food-primary">
                        当前
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate font-rounded text-xs font-medium text-food-dark">
                      {summary}
                    </span>
                  </span>
                  <span className="text-[11px] text-food-muted">继续对话 →</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(session.id)}
                  disabled={isActive}
                  aria-label="删除会话"
                  aria-disabled={isActive}
                  title={isActive ? '当前会话请用「清空对话」删除' : '删除会话'}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-food-muted transition-all duration-200 hover:bg-white/80 hover:text-food-primary focus:outline-none focus-visible:shadow-foodFocus disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-food-muted dark:hover:bg-white/10"
                >
                  <Trash2Icon />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="font-rounded text-xs leading-relaxed text-food-muted">
          聊聊今天想吃什么吧，问过的对话会在这里等你。
        </p>
      )}
    </div>
  )
}

export default function AskWorkspace({
  onSuggest,
  onPick,
  onResume,
  activeSessionId = null,
  onRemoveSession = () => {},
}) {
  const [chips, setChips] = useState(() => pickChips())
  const [greeting] = useState(() => pickGreeting())
  const daily = useMemo(() => pickDailySites(3), [])

  /** 点击 chip：换一批 + 触发提问（与原空态语义一致） */
  const handleChip = (text) => {
    setChips(pickChips())
    onSuggest(text)
  }

  return (
    <div className="ask-scroll mx-auto grid min-h-0 w-full max-w-6xl flex-1 grid-cols-1 gap-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 lg:grid-cols-3">
      {/* 左大卡：插画 + 品牌 + 问候 + 灵感 chips */}
      <div className="ask-panel ask-soft flex flex-col items-center justify-center rounded-[24px] p-6 text-center lg:col-span-2">
        <div className="flex justify-center">
          <AskIllustration />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <SakuraLogo className="h-8 w-8" />
          <h1 className="font-display text-section-title text-food-dark">樱见</h1>
        </div>
        <p className="mt-1.5 font-rounded text-xs leading-relaxed text-food-muted">
          站内美食网站挖一挖，烘焙下厨的小问题也能问
        </p>
        <p className="mt-2 font-rounded text-control text-food-muted">{greeting}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {chips.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => handleChip(text)}
              className="ask-chip rounded-full px-3.5 py-1.5 font-rounded text-xs focus:outline-none focus-visible:shadow-foodFocus"
            >
              {text}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setChips(pickChips())}
          className="mt-3 font-rounded text-xs text-food-muted underline decoration-dotted underline-offset-4 transition-colors hover:text-food-primary focus:outline-none focus-visible:shadow-foodFocus"
        >
          ⟳ 换一批灵感
        </button>
      </div>

      {/* 右列：今日美味 + 最近会话 */}
      <div className="flex min-h-0 flex-col gap-4 lg:col-span-1">
        <div className="ask-panel ask-soft flex flex-1 flex-col rounded-[22px] p-3.5">
          <p className="mb-2 font-rounded text-control font-bold text-food-dark">今日美味</p>
          <ul className="flex flex-1 flex-col justify-center gap-0.5">
            {daily.map((site) => (
              <li key={`${site.id}-${site.url}`}>
                <button
                  type="button"
                  onClick={() => onPick(site)}
                  className="group flex w-full items-center gap-2.5 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-white/70 focus:outline-none focus-visible:shadow-foodFocus dark:hover:bg-white/5"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-food-ring bg-food-tagBg text-base"
                  >
                    {CATEGORY_EMOJI[site.categoryKey] || '🍜'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-rounded text-control font-medium text-food-dark">
                      {site.name}
                    </span>
                    <span className="block truncate text-xs text-food-muted">
                      {site.categoryName}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-food-muted transition-transform duration-200 group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-food-muted">点一下自动填进输入框</p>
        </div>

        <RecentSession
          onResume={onResume}
          activeSessionId={activeSessionId}
          onRemoveSession={onRemoveSession}
        />
      </div>
    </div>
  )
}
