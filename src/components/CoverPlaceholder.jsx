export default function CoverPlaceholder({ className = '' }) {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className={`h-full w-full ${className}`}
      role="img"
      aria-label="美食预览占位插画"
    >
      <defs>
        <linearGradient id="cover-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFEFF6" />
          <stop offset="55%" stopColor="#FFE3EF" />
          <stop offset="100%" stopColor="#D9F0FF" />
        </linearGradient>
        <linearGradient id="cover-bowl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#FFF0F5" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#cover-sky)" />
      <circle cx="72" cy="64" r="34" fill="#FFFFFF" opacity="0.6" />
      <circle cx="336" cy="238" r="46" fill="#FFFFFF" opacity="0.5" />
      <path
        d="M330 70l5 13 13 5-13 5-5 13-5-13-13-5 13-5z"
        fill="#FFC94D"
      />
      <path
        d="M64 208l4 10 10 4-10 4-4 10-4-10-10-4 10-4z"
        fill="#FFFFFF"
        opacity="0.9"
      />
      <g
        fill="none"
        stroke="#FF8FB8"
        strokeWidth="7"
        strokeLinecap="round"
        opacity="0.65"
      >
        <path d="M174 106c14-16-12-30 2-46" />
        <path d="M210 98c14-16-12-30 2-46" />
        <path d="M246 106c14-16-12-30 2-46" />
      </g>
      <path
        d="M126 158h148l-12 62a30 30 0 0 1-30 25H168a30 30 0 0 1-30-25z"
        fill="url(#cover-bowl)"
        stroke="#FF6B9D"
        strokeWidth="5"
      />
      <path
        d="M118 152h164a9 9 0 0 1 0 18H118a9 9 0 0 1 0-18z"
        fill="#FFE1EC"
        stroke="#FF6B9D"
        strokeWidth="5"
      />
      <g stroke="#4B3A55" strokeWidth="5" strokeLinecap="round">
        <path d="M172 194c5 7 15 7 20 0" />
        <path d="M216 194c5 7 15 7 20 0" />
      </g>
      <g fill="#FFB7D0" opacity="0.9">
        <ellipse cx="164" cy="210" rx="11" ry="6" />
        <ellipse cx="244" cy="210" rx="11" ry="6" />
      </g>
      <ellipse cx="200" cy="256" rx="112" ry="14" fill="#FF6B9D" opacity="0.12" />
    </svg>
  )
}
