import { MorphIcon } from 'morphicons/react'
import CoverPlaceholder from '../CoverPlaceholder.jsx'
import { showToast } from '../../utils/toast.js'
import { getIconNode, Copy, Heart } from '../../icons/registry.js'
import { toggleFavorite, useFavorites } from '../../hooks/useFavorites.js'
import { copyText } from '../../utils/clipboard.js'

export default function NavCard({ name, desc, url, icon, coverImg, tag }) {
  const favorites = useFavorites()
  const favorite = favorites.includes(name)

  const handleFavorite = (event) => {
    event.preventDefault()
    event.stopPropagation()
    toggleFavorite(name)
  }

  const handleCopy = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    const ok = await copyText(url)
    showToast(ok ? '复制成功 ♡' : '复制失败，手动复制一下吧')
  }

  return (
    <div className="food-card group flex flex-col gap-3 p-3">
      {/* 整卡点击热区：位于装饰层之下、内容之上 */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`打开 ${name}`}
        className="absolute inset-0 z-0"
      />

      <span className="pointer-events-none absolute bottom-3 left-3 z-10 text-sm text-food-sun opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        ✦
      </span>

      <button
        type="button"
        onClick={handleFavorite}
        aria-pressed={favorite}
        aria-label={favorite ? `取消收藏 ${name}` : `收藏 ${name}`}
        className="absolute right-2.5 top-2.5 z-20 flex h-10 w-10 items-center justify-center rounded-full border-2 border-food-line bg-food-tagBg text-food-muted shadow-foodSticker transition-all duration-200 hover:-translate-y-0.5 hover:text-food-primary focus:outline-none focus-visible:shadow-foodFocus"
      >
        <MorphIcon
          icon={Heart}
          size={18}
          strokeWidth={2.4}
          fill={favorite ? 'currentColor' : 'none'}
          className={favorite ? 'text-food-primary' : ''}
        />
      </button>

      <div className="relative h-[120px] overflow-hidden rounded-media bg-food-tagBg ring-2 ring-food-ring md:h-[140px]">
        {coverImg ? (
          <img
            src={coverImg}
            alt={`${name} 预览图`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="h-full w-full transition-transform duration-300 group-hover:scale-[1.06]">
            <CoverPlaceholder />
          </div>
        )}
        {tag ? (
          <span className="absolute left-2 top-2 -rotate-[4deg] rounded-full border-2 border-food-line bg-food-primary px-2 py-0.5 text-[11px] font-bold leading-snug text-white shadow-foodTag">
            {tag}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 px-1 pb-1">
        <span className="flex min-w-0 items-center gap-2">
          <MorphIcon
            icon={getIconNode(icon)}
            size={22}
            strokeWidth={2}
            className="shrink-0 text-food-primary transition-transform duration-200 group-hover:-rotate-12 group-hover:scale-110"
          />
          <span className="truncate font-rounded text-card-title font-bold text-food-dark">
            {name}
          </span>
        </span>
        <span className="line-clamp-2 text-sm leading-relaxed text-food-text">
          {desc}
        </span>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        aria-label={`复制 ${name} 的链接`}
        className="absolute bottom-3 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border-2 border-food-line bg-food-tagBg text-food-primary opacity-0 shadow-foodSticker transition-opacity duration-200 focus:outline-none focus-visible:opacity-100 group-hover:opacity-100"
      >
        <MorphIcon icon={Copy} size={18} strokeWidth={2.2} />
      </button>
    </div>
  )
}
