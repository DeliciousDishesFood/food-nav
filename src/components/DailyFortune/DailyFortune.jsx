/**
 * task-23 · 首页「今日签」贴纸卡（新建组件，纯前端）
 *  - 日期种子固定：本地 Date → YYYY-MM-DD 字符串 hash → 先抽分类再抽站点，同一天刷新签文一致
 *  - 点击签卡主体 → 摇签动画（fortune.css keyframe 0.6s）+ Math.random 换签；
 *    花瓣由 SakuraBurst 全局 document click 捕获自动溅出（设计预期，不拦截）
 *  - 站点名 = 小链接（target=_blank），e.stopPropagation() 不触发摇签
 *  - groups 为空 → render null（不白屏）；色板全走现有 token，暗色自动适配
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import './fortune.css'

/** 摇签动画时长（与 fortune.css 的 0.6s 对齐，结束后摘掉 shake class） */
const SHAKE_MS = 650

/** 签文模板池：[站点名前缀, 站点名后缀]（站点名渲染为直达链接） */
const TEMPLATES = [
  (cat) => [`今日宜吃：${cat} → `, ''],
  (cat) => [`今天来点${cat}？试试`, ''],
  () => ['饿了的话，', ' 不错哦'],
  (cat) => [`今日签：${cat}の`, ''],
]

/** 本地时区日期键（跨零点才换签，不用 UTC） */
function dateKey() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 简单字符串 hash（charCode 累加 ×31，取绝对值） */
function hashCode(text) {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0
  return Math.abs(hash)
}

/** 过滤掉 0 站的空分类（某分类没站点就跳过） */
function usableGroups(groups) {
  return (Array.isArray(groups) ? groups : []).filter(
    (group) => group && Array.isArray(group.items) && group.items.length > 0,
  )
}

/** 日期种子抽签：分类 → 站点 → 模板，全部由 key 决定（同一天稳定） */
function seededPick(groups, key) {
  const list = usableGroups(groups)
  if (!list.length) return null
  const group = list[hashCode(`${key}:group`) % list.length]
  const site = group.items[hashCode(`${key}:site:${group.categoryKey || ''}`) % group.items.length]
  const templateIndex = hashCode(`${key}:tpl`) % TEMPLATES.length
  return { group, site, templateIndex }
}

/** 点击摇签后的真随机抽签 */
function randomPick(groups) {
  const list = usableGroups(groups)
  if (!list.length) return null
  const group = list[Math.floor(Math.random() * list.length)]
  const site = group.items[Math.floor(Math.random() * group.items.length)]
  return { group, site, templateIndex: Math.floor(Math.random() * TEMPLATES.length) }
}

export default function DailyFortune({ groups }) {
  const key = dateKey()
  const seeded = useMemo(() => seededPick(groups, key), [groups, key])
  const [rolled, setRolled] = useState(null)
  // key 递增触发重新挂载 → 摇签动画每次点击都能重放（首帧不播）
  const [rollCount, setRollCount] = useState(0)
  // 摇签中（类名挂载）→ SHAKE_MS 后自动摘除，动画结束后卡片回到常态
  const [shaking, setShaking] = useState(false)
  const shakeTimerRef = useRef(null)

  useEffect(
    () => () => {
      if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current)
    },
    [],
  )

  const pick = rolled || seeded
  if (!pick) return null

  const catName = pick.group.categoryName || ''
  const [before, after] = TEMPLATES[pick.templateIndex](catName)

  const handleRoll = () => {
    const next = randomPick(groups)
    if (next) setRolled(next)
    setRollCount((count) => count + 1)
    setShaking(true)
    if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current)
    shakeTimerRef.current = window.setTimeout(() => setShaking(false), SHAKE_MS)
  }

  const handleKeyDown = (event) => {
    // 站点链接上的按键不冒泡处理（链接自己回车直达）
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleRoll()
    }
  }

  return (
    <div className="mt-3 flex justify-center px-4">
      <div
        key={rollCount}
        role="button"
        tabIndex={0}
        aria-label="今日签，摇一摇换一签"
        onClick={handleRoll}
        onKeyDown={handleKeyDown}
        className={`daily-fortune inline-flex max-w-full cursor-pointer flex-wrap items-center justify-center gap-x-1.5 gap-y-1 rounded-2xl border-2 border-food-line bg-food-surface px-4 py-2 font-rounded text-sm text-food-dark shadow-foodSticker transition-transform duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:shadow-foodFocus ${
          shaking ? 'fortune-shake' : ''
        }`}
      >
        <span aria-hidden="true" className="shrink-0 text-base">
          🌸
        </span>
        <span className="min-w-0 text-center">
          {before}
          <a
            href={pick.site.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-block max-w-[120px] truncate align-bottom font-bold text-food-primary underline decoration-dotted underline-offset-2 hover:text-food-dark"
          >
            {pick.site.name}
          </a>
          {after}
        </span>
        <span aria-hidden="true" className="shrink-0 text-[11px] text-food-muted">
          （摇一摇）
        </span>
      </div>
    </div>
  )
}
