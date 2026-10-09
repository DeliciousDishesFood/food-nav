/**
 * M6 · 自定义滚动条（新建文件）
 * 外层 relative overflow-hidden → 内层保留原生滚动（仅视觉隐藏，滚轮/触摸不受影响）
 * → 右侧绝对定位 thumb div：高度 = 视口/内容 比例（最小 24px），位置随 scrollTop。
 * 支持：scroll + ResizeObserver（内容/窗口变化）重算、pointer 拖拽 thumb；
 * 内容不足一屏时 thumb 自动隐藏。零新依赖。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const MIN_THUMB_PX = 24

export default function CustomScrollbar({ scrollRef, className = '', children }) {
  const innerRef = useRef(null)
  const contentRef = useRef(null)
  const dragRef = useRef(null)
  const [thumb, setThumb] = useState({ visible: false, top: 0, height: MIN_THUMB_PX })

  const update = useCallback(() => {
    const el = innerRef.current
    if (!el) return
    const viewport = el.clientHeight
    const content = el.scrollHeight
    let next = { visible: false, top: 0, height: MIN_THUMB_PX }
    if (viewport && content > viewport + 1) {
      const height = Math.max(MIN_THUMB_PX, Math.round((viewport / content) * viewport))
      const track = viewport - height
      const top = Math.round((el.scrollTop / (content - viewport)) * track)
      next = { visible: true, top, height }
    }
    // 数值未变化时返回原对象 → React 跳过重渲染，避免「effect → setState」循环
    setThumb((prev) =>
      prev.visible === next.visible && prev.top === next.top && prev.height === next.height
        ? prev
        : next,
    )
  }, [])

  // 同时把外部 scrollRef 指到内层滚动容器（AskChat 借它做「滚到底」）
  const assignRef = useCallback(
    (node) => {
      innerRef.current = node
      if (scrollRef) scrollRef.current = node
    },
    [scrollRef],
  )

  useLayoutEffect(() => {
    update()
    const el = innerRef.current
    if (!el) return undefined

    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    let observer = null
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(update)
      observer.observe(el)
      if (contentRef.current) observer.observe(contentRef.current)
    }
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      if (observer) observer.disconnect()
    }
  }, [update])

  // 消息增长（流式）后补一帧重算：内容高度由 ResizeObserver 捕获，这里兜底首帧
  useEffect(() => {
    update()
    const id = requestAnimationFrame(update)
    return () => cancelAnimationFrame(id)
  }, [children, update])

  const startDrag = (event) => {
    const el = innerRef.current
    if (!el || !thumb.visible) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { startY: event.clientY, startScroll: el.scrollTop }
  }

  const moveDrag = (event) => {
    const state = dragRef.current
    const el = innerRef.current
    if (!state || !el) return
    const track = el.clientHeight - thumb.height
    const scrollable = el.scrollHeight - el.clientHeight
    if (track <= 0 || scrollable <= 0) return
    el.scrollTop = state.startScroll + ((event.clientY - state.startY) / track) * scrollable
  }

  const endDrag = (event) => {
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* 指针未捕获 */
    }
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={assignRef} className="ask-scroll h-full overflow-y-auto overscroll-contain">
        <div ref={contentRef}>{children}</div>
      </div>

      {thumb.visible ? (
        <div
          role="presentation"
          className="ask-thumb absolute right-1 top-0 w-1.5"
          style={{ top: thumb.top, height: thumb.height }}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      ) : null}
    </div>
  )
}
