export default function EmptyTip({ title, desc }) {
  const finalTitle = title ?? '呜呜，餐盘空空如也～'
  const finalDesc = desc ?? '换个关键词试试，或者去别的分类逛逛吧'

  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed border-[#FFC2D7] bg-white/85 px-6 py-16 text-center shadow-foodCard dark:border-[#4A3560] dark:bg-[#241A33]/85">
      <svg
        viewBox="0 0 240 160"
        className="h-40 w-60 animate-bob"
        role="img"
        aria-label="樱花与睡着的饭碗插画"
      >
        <rect
          width="240"
          height="160"
          rx="16"
          className="fill-[#FFF0F5] dark:fill-[#2A2040]"
        />
        <g className="fill-[#FFC2DA] dark:fill-[#FFA6C6]">
          <g transform="translate(40 36)">
            <ellipse cy="-9" rx="4.5" ry="7" />
            <ellipse cy="-9" rx="4.5" ry="7" transform="rotate(72)" />
            <ellipse cy="-9" rx="4.5" ry="7" transform="rotate(144)" />
            <ellipse cy="-9" rx="4.5" ry="7" transform="rotate(216)" />
            <ellipse cy="-9" rx="4.5" ry="7" transform="rotate(288)" />
            <circle r="3" className="fill-[#FFE9F1] dark:fill-[#33254A]" />
          </g>
          <g transform="translate(204 124) scale(0.72)">
            <ellipse cy="-9" rx="4.5" ry="7" />
            <ellipse cy="-9" rx="4.5" ry="7" transform="rotate(72)" />
            <ellipse cy="-9" rx="4.5" ry="7" transform="rotate(144)" />
            <ellipse cy="-9" rx="4.5" ry="7" transform="rotate(216)" />
            <ellipse cy="-9" rx="4.5" ry="7" transform="rotate(288)" />
            <circle r="3" className="fill-[#FFE9F1] dark:fill-[#33254A]" />
          </g>
        </g>
        <path
          d="M186 44l4 10 10 4-10 4-4 10-4-10-10-4 10-4z"
          fill="#FFC94D"
        />
        <path
          d="M54 88c8-10-8-18 0-28M84 84c8-10-8-18 0-28"
          fill="none"
          stroke="#9ED8F5"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M44 88h104l-9 40a24 24 0 0 1-24 19H77a24 24 0 0 1-24-19z"
          className="fill-white dark:fill-[#2E2344]"
          stroke="#FF8FB8"
          strokeWidth="4"
        />
        <path
          d="M38 82h116a8 8 0 0 1 0 16H38a8 8 0 0 1 0-16z"
          className="fill-[#FFE1EC] dark:fill-[#3E2F55]"
          stroke="#FF8FB8"
          strokeWidth="4"
        />
        <g
          className="stroke-[#4B3A55] dark:stroke-[#F6EDFD]"
          strokeWidth="4"
          strokeLinecap="round"
        >
          <path d="M76 116c4 5 12 5 16 0" />
          <path d="M104 116c4 5 12 5 16 0" />
        </g>
        <g className="fill-[#FFB7D0] dark:fill-[#FF8FB1]" opacity="0.85">
          <ellipse cx="70" cy="128" rx="9" ry="5" />
          <ellipse cx="126" cy="128" rx="9" ry="5" />
        </g>
        <text
          x="176"
          y="86"
          fontSize="22"
          className="fill-food-muted"
          fontFamily="sans-serif"
        >
          zZ
        </text>
        <ellipse
          cx="100"
          cy="156"
          rx="70"
          ry="8"
          className="fill-[#FFD9E6] dark:fill-[#150E20]"
        />
      </svg>
      <div className="flex flex-col gap-1.5">
        <p className="font-display text-section-title text-food-dark">
          {finalTitle}
        </p>
        <p className="text-card-desc text-food-muted">{finalDesc}</p>
      </div>
    </div>
  )
}
