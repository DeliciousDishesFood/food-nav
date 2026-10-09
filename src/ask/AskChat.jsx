/**
 * M6 · 聊天消息列表（AskChat）
 * 流式内容由 AskPage 解析 SSE 后写入 messages（50ms 节流），本组件只负责渲染。
 * M6 变更仅限视觉与建议文案（消息结构 / onSuggest 语义 / 推荐卡片交互零改动）：
 *  - 暖纸面气泡（AI 米白玻璃 + 用户樱花渐变）、头像、进场错落动画
 *  - 建议 chips 动态生成（分类×动作 + 随机池，3-4 个，点击后换一批）
 *  - 聊天区走 CustomScrollbar（原生滚动条视觉隐藏 + div thumb）
 *  - 流式光标改 h-[1em] w-[2px] translate-y-[0.2em]（em 跟随字号）
 * M8：空态分支删除（空态 = AskWorkspace 工作台，由 AskPage 条件渲染切换），
 *     消息容器 px-4 → pl-4 pr-7（右侧 28px 给滚动条留轨）；恢复会话首帧补一次滚底（rAF 兜底）。其余零改动。
 * M10：新增 onAskSite 透传给 AskCard（推荐卡主体点击 = 当前会话继续追问该站点）；
 *     消息结构 / onSuggest 语义 / SSE 渲染零改动。
 */
import { useEffect, useRef, useState } from 'react'
import AskCard from './AskCard.jsx'
import CustomScrollbar from './CustomScrollbar.jsx'
import { pickChips } from './askCopy.js'

function Avatar({ children }) {
  return (
    <span
      aria-hidden="true"
      className="ask-avatar mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
    >
      {children}
    </span>
  )
}

function Bubble({ message, chips, onChip, onAskSite, index }) {
  const status = message.status || 'done'
  const isUser = message.role === 'user'
  const delay = `${Math.min(index, 8) * 30}ms`

  if (isUser) {
    return (
      <div className="ask-enter flex items-end justify-end gap-2.5" style={{ animationDelay: delay }}>
        <div className="ask-bubble-me max-w-[85%] min-w-0 whitespace-pre-wrap rounded-[20px] rounded-br-md px-4 py-2.5 font-rounded text-control">
          {message.content}
        </div>
        <Avatar>🌸</Avatar>
      </div>
    )
  }

  return (
    <div className="ask-enter flex items-end gap-2.5" style={{ animationDelay: delay }}>
      <Avatar>✨</Avatar>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5">
        <div className="ask-bubble-ai max-w-[92%] min-w-0 whitespace-pre-wrap rounded-[20px] rounded-bl-md px-4 py-3 font-rounded text-control leading-relaxed text-food-dark">
          {message.content}
          {!message.content && status === 'streaming' ? '思考中…' : null}
          {status === 'streaming' ? (
            <span
              aria-hidden="true"
              className="ml-1 inline-block h-[1em] w-[2px] translate-y-[0.2em] animate-pulse bg-food-primary"
            />
          ) : null}
          {status === 'stopped' ? (
            <span className="mt-1 block text-xs text-food-muted">（已停止生成）</span>
          ) : null}
          {status === 'error' ? (
            <span className="mt-1 block text-xs text-food-primary">{message.error || '出错了，请重试'}</span>
          ) : null}
        </div>

        {Array.isArray(message.sites) && message.sites.length > 0 ? (
          <div className="ask-panel ask-soft w-full rounded-[20px] p-3">
            <p className="mb-2.5 flex items-center gap-1.5 font-rounded text-control font-bold text-food-primary">
              <span aria-hidden="true">✨</span>
              相关推荐
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {message.sites.map((site, siteIndex) => (
                <div
                  key={`${site.id}-${site.url}`}
                  className="ask-card-enter"
                  style={{ animationDelay: `${siteIndex * 60}ms` }}
                >
                  <AskCard site={site} onAsk={onAskSite} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {status === 'done' && !message.content ? (
          <p className="text-xs text-food-muted">（这次没有内容，换个问法试试？）</p>
        ) : null}

        {status === 'done' && message.showSuggestions && chips.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {chips.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => onChip(text)}
                className="ask-chip rounded-full px-3.5 py-1.5 font-rounded text-xs focus:outline-none focus-visible:shadow-foodFocus"
              >
                {text}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function AskChat({ messages, onSuggest, onAskSite }) {
  const scrollerRef = useRef(null)
  const [chips, setChips] = useState(() => pickChips())

  // 滚到底：消息变化（含 M8 恢复会话首帧）同步一次，rAF 补一帧防止首帧未落底
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return undefined
    el.scrollTop = el.scrollHeight
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [messages])

  /** 点击 chip：换一批 + 触发提问（onSuggest 语义不变） */
  const handleChip = (text) => {
    setChips(pickChips())
    onSuggest(text)
  }

  return (
    <CustomScrollbar className="min-h-0 flex-1" scrollRef={scrollerRef}>
      <div className="space-y-4 py-4 pl-4 pr-7">
        {messages.map((message, index) => (
          <Bubble
            key={message.id}
            index={index}
            message={message}
            chips={chips}
            onChip={handleChip}
            onAskSite={onAskSite}
          />
        ))}
      </div>
    </CustomScrollbar>
  )
}
