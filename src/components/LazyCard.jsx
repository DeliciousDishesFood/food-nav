import { useLayoutEffect, useRef, useState } from 'react'

/** 视口外扩距离：进入视口上下 240px 区域即渲染真实卡片 */
const NEAR_VIEWPORT_MARGIN = 240

/** 懒加载占位骨架：结构与 NavCard 一致，先占位再替换成真实卡片，避免布局跳动 */
function CardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="food-card flex flex-col gap-3 p-3 opacity-80"
    >
      <div className="h-[120px] rounded-media bg-food-tagBg ring-2 ring-food-ring md:h-[140px]" />
      <div className="flex flex-col gap-1 px-1 pb-1">
        <div className="h-6 w-2/3 rounded-full bg-food-soft" />
        <div className="h-[45px] rounded-lg bg-food-tagBg" />
      </div>
    </div>
  )
}

/**
 * 卡片懒加载容器：
 * 首屏 / 视口附近的卡片在绘制前同步渲染（无闪烁），
 * 更远的卡片先渲染等高骨架，进入视口区域后由 Intersection Observer 替换为真实内容。
 */
export default function LazyCard({ children }) {
  const containerRef = useRef(null)
  const [visible, setVisible] = useState(false)

  useLayoutEffect(() => {
    const node = containerRef.current
    if (!node || visible) return undefined

    // 同步预检：已在视口附近则直接渲染，避免首屏骨架闪烁
    const rect = node.getBoundingClientRect()
    const nearViewport =
      rect.top < window.innerHeight + NEAR_VIEWPORT_MARGIN &&
      rect.bottom > -NEAR_VIEWPORT_MARGIN

    if (nearViewport || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: `${NEAR_VIEWPORT_MARGIN}px 0px` },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible])

  return (
    <div ref={containerRef} className="grid" data-lazy="card">
      {visible ? children : <CardSkeleton />}
    </div>
  )
}
