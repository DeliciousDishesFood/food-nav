/**
 * M6 · 输入区（AskComposer）
 * 交互不变：Enter 发送 / Shift+Enter 换行；发送中禁用并把「发送」换成「停止」。
 * M6 变更（只动视觉与 placeholder 表现）：
 *  - placeholder 轮换池（≥8 条场景化短语，6-8s 轮换；聚焦固定 > 流式 > 轮换）
 *  - textarea 隐藏原生滚动条（.ask-scroll）+ auto-grow ≤150px 封顶
 *  - 暖纸面细边大圆角输入条 + 圆形渐变发送按钮
 */
import { useEffect, useRef, useState } from 'react'
import {
  PLACEHOLDER_FOCUS,
  PLACEHOLDER_POOL,
  PLACEHOLDER_STREAMING,
} from './askCopy.js'

export default function AskComposer({ value, onChange, onSend, onStop, streaming, disabled }) {
  const inputRef = useRef(null)
  const [phIndex, setPhIndex] = useState(0)
  const [focused, setFocused] = useState(false)

  // placeholder 轮换：6-8s 一条；卸载必清理（聚焦/流式优先级在渲染期判定）
  useEffect(() => {
    let timer = null
    const tick = () => {
      setPhIndex((prev) => (prev + 1) % PLACEHOLDER_POOL.length)
      timer = setTimeout(tick, 6000 + Math.floor(Math.random() * 2000))
    }
    timer = setTimeout(tick, 6000 + Math.floor(Math.random() * 2000))
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const el = inputRef.current
    if (el && !value) {
      el.style.height = 'auto'
    }
  }, [value])

  const placeholder = focused
    ? PLACEHOLDER_FOCUS
    : streaming
      ? PLACEHOLDER_STREAMING
      : PLACEHOLDER_POOL[phIndex]

  const submit = () => {
    if (streaming || disabled) return
    onSend(value)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  const handleInput = (event) => {
    const el = event.target
    onChange(el.value)
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`
  }

  return (
    <div className="shrink-0 bg-transparent">
      <div className="mx-auto flex w-full max-w-6xl items-end gap-3 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
        <div className="ask-panel ask-soft ask-composer-field flex min-h-[52px] min-w-0 flex-1 items-end gap-2 rounded-[28px] px-2 py-1.5">
          <textarea
            ref={inputRef}
            rows={1}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={streaming}
            placeholder={placeholder}
            aria-label="提问输入框"
            className="ask-scroll max-h-[150px] min-h-[44px] min-w-0 flex-1 resize-none rounded-2xl bg-transparent px-3 py-2.5 font-rounded text-control text-food-dark transition-shadow duration-200 placeholder:text-food-muted focus:outline-none disabled:opacity-70"
          />
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              className="flex h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-food-ring bg-white/85 px-4 font-rounded text-control font-bold text-food-primary shadow-[0_6px_18px_rgba(244,114,182,0.16)] transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:shadow-foodFocus dark:bg-[#2C2140]/90"
            >
              ■ 停止
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={disabled || !value.trim()}
              className="ask-send flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full font-rounded text-control font-bold focus:outline-none focus-visible:shadow-foodFocus"
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
