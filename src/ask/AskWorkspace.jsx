/**
 * M8/M10 · AI 页工作台（空态）
 * AskPage 在 messages.length === 0 时渲染本组件；发出第一条消息后整块卸载，
 * 切换为纯净单栏 AskChat。
 * task-23 极简化：删掉「今日美味」「最近会话」两个静态面板（判定鸡肋），
 *  3 列 grid → 单列垂直居中：插画 + 品牌问候 + 大输入框（children 注入 AskComposer）
 *  + 灵感 chips（换一批保留）；
 *  最近会话收进 header History 图标浮层（见 AskHistoryMenu.jsx，可恢复可单删）。
 * 零耦合：不 import 任何主站组件；chips 文案取静态快照（禁新接口）。
 */
import { useState } from 'react'
import { pickChips, pickGreeting } from './askCopy.js'

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

export default function AskWorkspace({ onSuggest, children }) {
  const [chips, setChips] = useState(() => pickChips())
  const [greeting] = useState(() => pickGreeting())

  /** 点击 chip：换一批 + 触发提问（与原空态语义一致） */
  const handleChip = (text) => {
    setChips(pickChips())
    onSuggest(text)
  }

  return (
    <div className="ask-scroll mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col items-center justify-center overflow-y-auto overscroll-contain px-4 py-6">
      {/* 单列居中：插画 + 品牌 + 问候 + 输入框 + 灵感 chips */}
      <div className="flex w-full max-w-xl flex-col items-center text-center">
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
        {/* 大输入框（AskComposer 由 AskPage 注入：插画 → 问候 → 输入框 → chips 一列居中） */}
        {children}
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
    </div>
  )
}
