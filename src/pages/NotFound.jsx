import { MorphIcon } from 'morphicons/react'
import Layout from '../components/Layout/Layout.jsx'
import Footer from '../components/Layout/Footer.jsx'
import { Sparkles } from '../icons/registry.js'

function Blossom({ transform, size = 1 }) {
  return (
    <g transform={transform}>
      <g transform={`scale(${size})`} className="fill-[#FFC2DA] dark:fill-[#FFA6C6]">
        <ellipse cy="-9" rx="4.5" ry="7" />
        <ellipse cy="-9" rx="4.5" ry="7" transform="rotate(72)" />
        <ellipse cy="-9" rx="4.5" ry="7" transform="rotate(144)" />
        <ellipse cy="-9" rx="4.5" ry="7" transform="rotate(216)" />
        <ellipse cy="-9" rx="4.5" ry="7" transform="rotate(288)" />
        <circle r="3" className="fill-[#FFE9F1] dark:fill-[#33254A]" />
      </g>
    </g>
  )
}

/** 404：樱花贴纸插画 + 暖心文案 + 返回首页 */
export default function NotFound() {
  return (
    <Layout>
      <main className="flex flex-1 flex-col items-center justify-center gap-7 py-14">
        <div className="food-card flex w-full max-w-md flex-col items-center gap-5 px-7 py-10 text-center">
          <svg
            viewBox="0 0 240 160"
            className="h-36 w-full max-w-[240px]"
            role="img"
            aria-label="樱花插画"
          >
            <rect
              width="240"
              height="160"
              rx="16"
              className="fill-[#FFF0F5] dark:fill-[#2A2040]"
            />
            <path
              d="M24 128c40-18 78-30 120-34 34-3 54-14 72-32"
              fill="none"
              className="stroke-[#FFD9E6] dark:stroke-[#4A3560]"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <Blossom transform="translate(58 84)" size={1.4} />
            <Blossom transform="translate(126 62)" size={1} />
            <Blossom transform="translate(196 46)" size={0.8} />
            <path
              d="M196 116l3.6 9 9 3.6-9 3.6-3.6 9-3.6-9-9-3.6 9-3.6z"
              fill="#FFC94D"
            />
            <text
              x="120"
              y="132"
              textAnchor="middle"
              fontSize="46"
              fontWeight="700"
              className="fill-food-primary"
            >
              404
            </text>
          </svg>

          <div className="flex flex-col gap-2">
            <h1 className="font-display text-section-title text-food-dark">
              呜，这块小餐牌不见啦～
            </h1>
            <p className="text-card-desc text-food-muted">
              页面可能被端走了，先回首页找点好吃的吧
            </p>
          </div>

          <a
            href="#/"
            className="inline-flex items-center gap-2 rounded-full border-2 border-food-line bg-food-primary px-6 py-2.5 font-rounded text-control font-bold text-white shadow-foodTab transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:shadow-foodFocus"
          >
            <MorphIcon icon={Sparkles} size={18} strokeWidth={2.2} />
            回到首页
          </a>
        </div>
      </main>
      <Footer />
    </Layout>
  )
}
