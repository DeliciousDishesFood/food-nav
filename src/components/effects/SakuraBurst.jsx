/**
 * M10 · 全局点击樱花散花（新建目录/新建文件，主站现有组件零改动）
 * 挂载于 App（全站生效）：document 捕获阶段监听 click —— 只生成花瓣，绝不
 * preventDefault / stopPropagation，卡片、按钮、外链照常工作。
 * 规则：300ms 频率限制；每次 3-5 片；~1s 后淡出并移除 DOM（不泄漏）；
 *      prefers-reduced-motion 直接不触发；键盘触发的 click（detail=0）取元素中心。
 * 零新依赖：花瓣为手绘五瓣樱 SVG（与 EmptyTip/SakuraLogo 同风格），樱花粉配色。
 */
import { useEffect } from 'react'
import '../../styles/sakura-burst.css'

/** 同一时间两次散花的最小间隔（ms） */
const THROTTLE_MS = 300
/** 动画时长 + 清理余量（CSS 动画 1s，稍后移除） */
const LIFE_MS = 1100

/** 五瓣樱花 SVG（常量，不含任何用户输入 → innerHTML 安全） */
const PETAL_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">' +
  '<g fill="currentColor">' +
  [0, 72, 144, 216, 288]
    .map(
      (deg) =>
        `<path d="M12 12c-2.5-1.7-3.2-5.1-.7-7.9.4-.5 1.2-.5 1.6 0 2.5 2.8 1.8 6.2-.9 7.9z" transform="rotate(${deg} 12 12)"/>`,
    )
    .join('') +
  '</g>' +
  '<circle cx="12" cy="12" r="1.6" fill="#FF6B9D"/>' +
  '</svg>'

/** 生成一片花瓣（随机方向/距离/旋转），落在层容器里，动画结束自动移除 */
function spawnPetal(host, x, y, index) {
  const petal = document.createElement('span')
  const angle = Math.random() * Math.PI * 2
  const distance = 14 + Math.random() * 26
  petal.className = 'sakura-petal'
  petal.style.left = `${x}px`
  petal.style.top = `${y}px`
  petal.style.color = index % 2 === 0 ? '#FFC2DA' : '#FF8FB1'
  petal.style.setProperty('--sakura-dx', `${(Math.cos(angle) * distance).toFixed(1)}px`)
  petal.style.setProperty('--sakura-dy', `${(Math.sin(angle) * distance - 8).toFixed(1)}px`)
  petal.style.setProperty('--sakura-rot', `${(40 + Math.random() * 140).toFixed(0)}deg`)
  petal.style.animationDelay = `${index * 30}ms`
  petal.innerHTML = PETAL_SVG
  host.appendChild(petal)
  window.setTimeout(() => petal.remove(), LIFE_MS + index * 30)
}

export default function SakuraBurst() {
  useEffect(() => {
    let lastBurstAt = 0
    let layer = null

    const onClick = (event) => {
      try {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        const now = Date.now()
        if (now - lastBurstAt < THROTTLE_MS) return
        lastBurstAt = now

        // 键盘触发的 click（clientX/Y 为 0）→ 取目标元素中心，避免堆在左上角
        let x = event.clientX
        let y = event.clientY
        if ((!x && !y) && event.target && typeof event.target.getBoundingClientRect === 'function') {
          const rect = event.target.getBoundingClientRect()
          x = rect.left + rect.width / 2
          y = rect.top + rect.height / 2
        }

        if (!layer || !layer.isConnected) {
          layer = document.createElement('div')
          layer.className = 'sakura-layer'
          layer.setAttribute('aria-hidden', 'true')
          document.body.appendChild(layer)
        }

        const count = 3 + Math.floor(Math.random() * 3) // 3-5 片
        for (let i = 0; i < count; i += 1) spawnPetal(layer, x, y, i)
      } catch {
        /* 动效异常绝不影响点击本身 */
      }
    }

    document.addEventListener('click', onClick, true)

    return () => {
      document.removeEventListener('click', onClick, true)
      if (layer) layer.remove()
    }
  }, [])

  return null
}
