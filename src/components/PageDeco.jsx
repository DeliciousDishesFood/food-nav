import { useEffect, useRef } from 'react'

/** 背景星星弱视差系数（0.1 ~ 0.2，仅背景装饰允许，页面主体元素禁止视差） */
const PARALLAX_FACTOR = 0.15
/** 视差最大位移（px），避免长时间滚动后星星飘出视口 */
const PARALLAX_MAX = 72

const PETALS = [
  { left: '4%', duration: '16s', delay: '0s', size: 16 },
  { left: '18%', duration: '21s', delay: '3s', size: 12 },
  { left: '34%', duration: '18s', delay: '7s', size: 14 },
  { left: '52%', duration: '24s', delay: '1.5s', size: 18 },
  { left: '68%', duration: '17s', delay: '9s', size: 13 },
  { left: '82%', duration: '22s', delay: '5s', size: 16 },
  { left: '93%', duration: '19s', delay: '11s', size: 12 },
]

const SPARKLES = [
  { top: '12%', left: '8%', size: 14, delay: '0s' },
  { top: '26%', left: '88%', size: 18, delay: '1.2s' },
  { top: '58%', left: '5%', size: 12, delay: '2.4s' },
  { top: '74%', left: '92%', size: 16, delay: '0.6s' },
  { top: '42%', left: '70%', size: 12, delay: '3s' },
]

function Petal({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2c4 2 7 6 6 11-1 5-5 8-9 8-3 0-6-2-6-5 0-4 4-6 7-8 2-1 3-4 2-6z"
        className="fill-[#FFB7D0] dark:fill-[#FF9EC1]"
        opacity="0.85"
      />
      <path
        d="M12 2c4 2 7 6 6 11-1 5-5 8-9 8"
        fill="none"
        className="stroke-[#FF8FB8] dark:stroke-[#FF7FAF]"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Sparkle({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2l2.2 6.1L20.5 10l-6.3 1.9L12 18l-2.2-6.1L3.5 10l6.3-1.9z"
        className="fill-[#FFC94D] dark:fill-[#FFE07A]"
      />
    </svg>
  )
}

/** 页面装饰层：飘落樱花 + 闪烁星星（纯 SVG，不依赖图片）
 *  仅星星做微弱滚动视差，花瓣与页面主体保持原位不位移 */
export default function PageDeco() {
  // 星星节点引用：视差直接写 style，不经过 React 状态，滚动零重渲染
  const starRefs = useRef([])

  useEffect(() => {
    let frame = 0

    const update = () => {
      frame = 0
      const offset = Math.min(window.scrollY * PARALLAX_FACTOR, PARALLAX_MAX)
      starRefs.current.forEach((node) => {
        if (node) node.style.transform = `translate3d(0, ${offset}px, 0)`
      })
    }

    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {PETALS.map((petal, index) => (
        <span
          key={`petal-${index}`}
          className="absolute -top-8 animate-petal-fall"
          style={{
            left: petal.left,
            animationDuration: petal.duration,
            animationDelay: petal.delay,
          }}
        >
          <Petal size={petal.size} />
        </span>
      ))}
      {SPARKLES.map((sparkle, index) => (
        <span
          key={`sparkle-${index}`}
          ref={(node) => {
            starRefs.current[index] = node
          }}
          className="absolute"
          style={{
            top: sparkle.top,
            left: sparkle.left,
          }}
        >
          <span
            className="block animate-twinkle"
            style={{
              animationDuration: '3.2s',
              animationDelay: sparkle.delay,
            }}
          >
            <Sparkle size={sparkle.size} />
          </span>
        </span>
      ))}
    </div>
  )
}
