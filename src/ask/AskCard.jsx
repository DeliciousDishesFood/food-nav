/**
 * M6 · 推荐卡片（AskCard）
 * 独立实现：不 import 任何主站组件（NavCard/LazyCard 等一律禁止），只复用 tailwind 设计 token。
 * M6 视觉（贴纸硬阴影 → 暖纸面柔影细边）。
 * M10 · AI 推荐闭环（交互语义变化）：
 *  - 卡片主体点击 = 在当前会话继续追问该站点（onAsk(site) → AskPage 既有发送链路 SSE 流式回答）
 *  - 右上角 ExternalLink 小按钮（40×40 触控目标）= 打开站点 target=_blank + rel=noopener
 *    （唯一保留的外链入口，仍命中全局点击埋点）
 */
import { CATEGORY_EMOJI } from './askCopy.js'

/** ExternalLink（lucide 风格，手绘 SVG：零新依赖） */
function ExternalLinkIcon() {
  return (
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
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  )
}

export default function AskCard({ site, onAsk }) {
  if (!site || !site.url) return null
  const emoji = CATEGORY_EMOJI[site.categoryKey] || '🍜'
  const canAsk = typeof onAsk === 'function'

  // 未接回调的兜底（AskChat 恒传 onAsk）：保持卡片可打开，不留死卡
  const handleMain = () => {
    if (canAsk) onAsk(site)
    else window.open(site.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleMain}
        aria-label={`关于${site.name}继续追问`}
        className="ask-panel ask-soft ask-soft-hover group flex w-full items-start gap-3 rounded-[20px] pl-3.5 pt-3.5 pr-12 pb-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:shadow-foodFocus"
      >
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-food-ring bg-food-tagBg text-xl transition-transform duration-200 group-hover:-rotate-6"
        >
          {emoji}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-rounded text-card-title font-bold text-food-dark">
              {site.name}
            </span>
          </span>
          <span className="line-clamp-2 text-sm leading-relaxed text-food-text">{site.desc}</span>
          <span className="mt-0.5 inline-flex items-center gap-1 font-rounded text-control font-bold text-food-primary">
            继续追问
            <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
              →
            </span>
          </span>
        </span>
      </button>

      {/* 右上角打开站点：40×40 触控目标，独立于主体按钮（兄弟节点，不会触发追问） */}
      <a
        href={site.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`打开${site.name}站点`}
        title="打开站点"
        className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/90 bg-white/85 text-food-muted shadow-[0_4px_14px_rgba(244,114,182,0.16)] transition-all duration-200 hover:-translate-y-0.5 hover:text-food-primary focus:outline-none focus-visible:shadow-foodFocus dark:border-white/10 dark:bg-[#2C2140]/90"
      >
        <ExternalLinkIcon />
      </a>
    </div>
  )
}
