import { useRef } from 'react'
import { MorphIcon } from 'morphicons/react'
import { Search, SearchX } from '../icons/registry.js'

export default function SearchBar({ value, onChange }) {
  const inputRef = useRef(null)
  const hasValue = value.length > 0

  const clear = () => {
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <label className="group relative block w-full transition-transform duration-200 hover:-translate-y-0.5 focus-within:-translate-y-0.5">
      <MorphIcon
        icon={Search}
        size={18}
        strokeWidth={2.2}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-food-primary transition-transform duration-200 group-hover:-rotate-12 group-hover:scale-110 group-focus-within:-rotate-12 group-focus-within:scale-110"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="搜一搜你想吃的美味…"
        className="h-11 w-full rounded-full border-2 border-food-accent-soft bg-food-surface pl-11 pr-10 font-rounded text-control text-food-dark caret-food-primary shadow-foodSticker transition-all duration-200 placeholder:text-food-muted hover:border-food-primary/60 focus:border-food-primary focus:shadow-foodFocus focus:outline-none"
      />
      {hasValue ? (
        <button
          type="button"
          onClick={clear}
          aria-label="清空搜索"
          title="清空搜索"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-food-muted transition-colors duration-200 hover:bg-food-tagBg hover:text-food-primary focus:outline-none focus-visible:shadow-foodFocus"
        >
          <MorphIcon icon={SearchX} size={16} strokeWidth={2.2} />
        </button>
      ) : null}
    </label>
  )
}
