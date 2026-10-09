/**
 * 访问量折线图（M4）：手写 SVG，零依赖（禁图表库/CDN）
 * - viewBox 响应式（width 100%，375px 不溢出）
 * - 贴纸风：token 色（--food-primary / --food-accent-soft）、圆角折线、虚线网格
 * - 数据点悬停显示 title，峰值点高亮 + 标注
 */

const W = 720
const H = 260
const PAD = { top: 26, right: 18, bottom: 34, left: 46 }

/** 'YYYY-MM-DD' → 'MM-DD' */
function shortDate(value) {
  const parts = String(value || '').split('-')
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : String(value || '')
}

const f1 = (value) => Math.round(value * 10) / 10

export default function StatsChart({ data }) {
  const points = (Array.isArray(data) ? data : []).filter((item) => item && item.date)

  if (points.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-2xl border-2 border-dashed border-food-accent-soft bg-food-tagBg px-4 text-center text-control text-food-muted">
        还没有访问数据，部署后打开主站即可累计
      </div>
    )
  }

  const maxUv = Math.max(1, ...points.map((item) => Number(item.uv) || 0))
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const xOf = (index) =>
    points.length === 1
      ? PAD.left + innerW / 2
      : PAD.left + (index / (points.length - 1)) * innerW
  const yOf = (value) => PAD.top + innerH - ((Number(value) || 0) / maxUv) * innerH

  const lastX = xOf(points.length - 1)
  const firstX = xOf(0)
  const y0 = PAD.top + innerH

  const linePath =
    points.length === 1
      ? `M${f1(PAD.left)},${f1(yOf(points[0].uv))} L${f1(W - PAD.right)},${f1(yOf(points[0].uv))}`
      : points
          .map((item, index) => `${index === 0 ? 'M' : 'L'}${f1(xOf(index))},${f1(yOf(item.uv))}`)
          .join(' ')
  const areaPath =
    points.length === 1
      ? `M${f1(PAD.left)},${f1(yOf(points[0].uv))} L${f1(W - PAD.right)},${f1(yOf(points[0].uv))} L${f1(W - PAD.right)},${f1(y0)} L${f1(PAD.left)},${f1(y0)} Z`
      : `${linePath} L${f1(lastX)},${f1(y0)} L${f1(firstX)},${f1(y0)} Z`

  let peakIndex = 0
  points.forEach((item, index) => {
    if ((Number(item.uv) || 0) > (Number(points[peakIndex].uv) || 0)) peakIndex = index
  })
  const peakUv = Number(points[peakIndex].uv) || 0
  const peakX = xOf(peakIndex)
  const peakY = yOf(peakUv)

  const ticks = [0, 1, 2, 3].map((step) => Math.round((maxUv * step) / 3))
  const lastIndex = points.length - 1
  const labelMinGap = innerW / 7
  const labelIndexes = [0]
  for (let index = 1; index < lastIndex; index += 1) {
    if (xOf(index) - xOf(labelIndexes[labelIndexes.length - 1]) >= labelMinGap) {
      labelIndexes.push(index)
    }
  }
  if (lastIndex > 0) {
    if (xOf(lastIndex) - xOf(labelIndexes[labelIndexes.length - 1]) < labelMinGap) {
      labelIndexes.pop()
    }
    labelIndexes.push(lastIndex)
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-auto w-full font-rounded"
      role="img"
      aria-label={`近 ${points.length} 天访问量折线图，峰值 ${peakUv}`}
    >
      {ticks.map((tick) => {
        const y = yOf(tick)
        return (
          <g key={`tick-${tick}`}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={f1(y)}
              y2={f1(y)}
              stroke="var(--food-accent-soft)"
              strokeWidth={2}
              strokeDasharray="5 7"
            />
            <text
              x={PAD.left - 9}
              y={f1(y) + 4}
              textAnchor="end"
              fontSize={12}
              className="fill-food-muted"
            >
              {tick}
            </text>
          </g>
        )
      })}

      <path d={areaPath} fill="var(--food-primary)" fillOpacity={0.14} />

      <path
        d={linePath}
        fill="none"
        stroke="var(--food-primary)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {points.map((item, index) => (
        <circle
          key={`${item.date}-${index}`}
          cx={f1(xOf(index))}
          cy={f1(yOf(item.uv))}
          r={index === peakIndex ? 5.5 : 3.5}
          fill={index === peakIndex ? 'var(--food-sun)' : 'var(--food-primary)'}
          stroke="var(--food-surface)"
          strokeWidth={2}
        >
          <title>{`${item.date} · ${item.uv} 人`}</title>
        </circle>
      ))}

      <text
        x={f1(Math.min(Math.max(peakX, PAD.left + 34), W - PAD.right - 34))}
        y={f1(Math.max(peakY - 13, 14))}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        className="fill-food-primary"
      >
        {`峰值 ${peakUv}`}
      </text>

      <line
        x1={PAD.left}
        x2={PAD.left}
        y1={PAD.top - 6}
        y2={f1(y0)}
        stroke="var(--food-accent-soft)"
        strokeWidth={2}
        strokeLinecap="round"
      />

      {labelIndexes.map((index) => (
        <text
          key={`label-${points[index].date}-${index}`}
          x={f1(xOf(index))}
          y={H - 10}
          textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
          fontSize={12}
          className="fill-food-muted"
        >
          {shortDate(points[index].date)}
        </text>
      ))}
    </svg>
  )
}
