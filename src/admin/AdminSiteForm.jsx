import { useState } from 'react'
import IconPicker from './IconPicker.jsx'
import { createSite, coverPreviewUrl, errorMessage, updateSite } from './AdminApi.js'

/** public/covers 下的 12 张内置插画 */
const BUILTIN_COVERS = [
  'noodle',
  'dish',
  'dessert',
  'cake',
  'icecream',
  'burger',
  'delivery',
  'coffee',
  'milktea',
  'fries',
  'fruit',
  'market',
]

const COVER_MODES = [
  { key: 'builtin', label: '内置插画' },
  { key: 'favicon', label: '自动 favicon' },
  { key: 'url', label: '图片 URL' },
]

/** 角标快捷打标（M4）：管理员常用标签；仍可用下方输入框自定义 */
const TAG_PRESETS = ['热门', '新品', '推荐']

/** 已存 coverImg → 三模式初始值 */
function parseCover(coverImg) {
  const value = typeof coverImg === 'string' ? coverImg.trim() : ''
  if (value.startsWith('favicon:')) {
    return { mode: 'favicon', builtin: '', domain: value.slice(8), url: '' }
  }
  if (value.startsWith('/covers/')) {
    return { mode: 'builtin', builtin: value, domain: '', url: '' }
  }
  if (/^https?:\/\//.test(value)) {
    return { mode: 'url', builtin: '', domain: '', url: value }
  }
  return { mode: 'builtin', builtin: '', domain: '', url: '' }
}

function composeCover(mode, builtin, domain, url) {
  if (mode === 'favicon') {
    const value = domain.trim()
    return value ? `favicon:${value.toLowerCase()}` : ''
  }
  if (mode === 'url') return url.trim()
  return builtin
}

const FIELD_CLASS =
  'w-full rounded-2xl border-2 border-food-line bg-food-surface2 px-3.5 py-2.5 text-control text-food-dark outline-none transition-shadow placeholder:text-food-muted focus:shadow-foodFocus'

/** 站点新增/编辑表单（弹层）：名称/描述/URL/图标选择器/分类/封面三模式/角标/排序 */
export default function AdminSiteForm({ site, categories, onClose, onSaved }) {
  const initial = site || {}
  const parsed = parseCover(initial.coverImg)

  const [name, setName] = useState(initial.name || '')
  const [desc, setDesc] = useState(initial.desc || '')
  const [url, setUrl] = useState(initial.url || '')
  const [icon, setIcon] = useState(initial.icon || '')
  const [categoryId, setCategoryId] = useState(initial.categoryId || '')
  const [tag, setTag] = useState(initial.tag || '')
  const [sortOrder, setSortOrder] = useState(String(initial.sortOrder ?? 0))
  const [coverMode, setCoverMode] = useState(parsed.mode)
  const [coverBuiltin, setCoverBuiltin] = useState(parsed.builtin)
  const [coverDomain, setCoverDomain] = useState(parsed.domain)
  const [coverUrl, setCoverUrl] = useState(parsed.url)
  const [skipCheck, setSkipCheck] = useState(initial.skipCheck === true)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const coverImg = composeCover(coverMode, coverBuiltin, coverDomain, coverUrl)
  const preview = coverPreviewUrl(coverImg)

  const validate = () => {
    const trimmedName = name.trim()
    if (!trimmedName) return '站点名称必填'
    if ([...trimmedName].length > 50) return '站点名称不能超过 50 字'
    const trimmedUrl = url.trim()
    if (!/^https?:\/\//i.test(trimmedUrl)) return '链接必须以 http:// 或 https:// 开头'
    if (trimmedUrl.length > 300) return '链接不能超过 300 字'
    try {
      new URL(trimmedUrl)
    } catch {
      return '链接格式不正确'
    }
    if (!icon) return '请先在图标选择器中挑一个图标'
    if (!categoryId) return '请选择所属分类'
    if ([...desc.trim()].length > 100) return '描述不能超过 100 字'
    if ([...tag.trim()].length > 10) return '角标不能超过 10 字'
    const order = Number(sortOrder)
    if (!Number.isInteger(order) || order < 0) return '排序必须是 ≥0 的整数'
    if (coverMode === 'favicon') {
      const domain = coverDomain.trim()
      if (domain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) {
        return 'favicon 域名格式不正确（如 github.com）'
      }
    }
    if (coverMode === 'url') {
      const cover = coverUrl.trim()
      if (cover && !/^https?:\/\//i.test(cover)) return '封面地址必须以 http:// 或 https:// 开头'
      if (cover.length > 300) return '封面地址不能超过 300 字'
    }
    return ''
  }

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    const message = validate()
    if (message) {
      setFormError(message)
      return
    }
    setBusy(true)
    setFormError('')
    const body = {
      name: name.trim(),
      desc: desc.trim(),
      url: url.trim(),
      icon,
      coverImg,
      tag: tag.trim(),
      sortOrder: Number(sortOrder),
      categoryId: Number(categoryId),
      skipCheck,
    }
    const { payload } = site
      ? await updateSite(site.id, body)
      : await createSite(body)
    setBusy(false)
    if (payload.ok === true) {
      onSaved(payload.data)
      return
    }
    setFormError(errorMessage(payload))
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={site ? '编辑站点' : '新增站点'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        onSubmit={submit}
        className="my-4 w-full max-w-2xl rounded-3xl border-2 border-food-line bg-food-surface p-5 shadow-foodSticker"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-section-title text-food-dark">
            {site ? `编辑站点 · ${site.name}` : '新增站点'}
          </h2>
          <button
            type="button"
            aria-label="关闭表单"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-food-line bg-food-tagBg text-food-muted shadow-foodSticker transition-colors hover:text-food-primary"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="font-rounded text-control font-bold text-food-dark">
              名称 <span className="text-food-primary">*</span>
            </span>
            <input
              value={name}
              maxLength={50}
              placeholder="如：下厨房"
              onChange={(event) => setName(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-rounded text-control font-bold text-food-dark">
              链接 <span className="text-food-primary">*</span>
            </span>
            <input
              value={url}
              placeholder="https://example.com/"
              onChange={(event) => setUrl(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>

          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="font-rounded text-control font-bold text-food-dark">描述</span>
            <textarea
              value={desc}
              rows={2}
              maxLength={100}
              placeholder="一句话介绍（≤100 字）"
              onChange={(event) => setDesc(event.target.value)}
              className={`${FIELD_CLASS} resize-none`}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-rounded text-control font-bold text-food-dark">
              所属分类 <span className="text-food-primary">*</span>
            </span>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">请选择分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="font-rounded text-control font-bold text-food-dark">角标</span>
            <select
              value={tag ? (TAG_PRESETS.includes(tag) ? tag : 'custom') : ''}
              aria-label="角标快捷打标"
              onChange={(event) => {
                const value = event.target.value
                if (value !== 'custom') setTag(value)
              }}
              className={FIELD_CLASS}
            >
              <option value="">无角标</option>
              {TAG_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
              {tag && !TAG_PRESETS.includes(tag) ? (
                <option value="custom">{tag}（自定义）</option>
              ) : null}
            </select>
            <input
              value={tag}
              maxLength={10}
              placeholder="也可自定义（≤10 字）"
              onChange={(event) => setTag(event.target.value)}
              className={FIELD_CLASS}
            />
            <span className="text-xs text-food-muted">打标后主站卡片角标自动显示</span>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="font-rounded text-control font-bold text-food-dark">排序</span>
            <input
              value={sortOrder}
              type="number"
              min={0}
              step={1}
              onChange={(event) => setSortOrder(event.target.value)}
              className={FIELD_CLASS}
            />
            <span className="text-xs text-food-muted">数字越小越靠前</span>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="font-rounded text-control font-bold text-food-dark">
              图标 <span className="text-food-primary">*</span>
            </span>
            <IconPicker value={icon} onChange={setIcon} />
          </div>

          <div className="flex flex-col gap-2 md:col-span-2">
            <span className="font-rounded text-control font-bold text-food-dark">封面</span>
            <div className="flex flex-wrap gap-2">
              {COVER_MODES.map((mode) => {
                const active = coverMode === mode.key
                return (
                  <button
                    key={mode.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCoverMode(mode.key)}
                    className={
                      active
                        ? 'rounded-full border-2 border-food-line bg-food-primary px-4 py-1.5 font-rounded text-control font-bold text-white shadow-foodTab'
                        : 'rounded-full border-2 border-food-line bg-food-surface px-4 py-1.5 font-rounded text-control font-medium text-food-dark shadow-foodSticker transition-all hover:-translate-y-0.5'
                    }
                  >
                    {mode.label}
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
              <div className="flex flex-col gap-2">
                {coverMode === 'builtin' ? (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    <button
                      type="button"
                      aria-pressed={coverBuiltin === ''}
                      onClick={() => setCoverBuiltin('')}
                      className={
                        coverBuiltin === ''
                          ? 'flex h-14 flex-col items-center justify-center rounded-xl border-2 border-food-primary bg-food-tagBg text-xs font-bold text-food-primary'
                          : 'flex h-14 flex-col items-center justify-center rounded-xl border-2 border-food-line bg-food-tagBg text-xs text-food-muted shadow-foodSticker transition-all hover:-translate-y-0.5'
                      }
                    >
                      <span aria-hidden="true">✦</span>
                      默认占位
                    </button>
                    {BUILTIN_COVERS.map((cover) => {
                      const value = `/covers/${cover}.svg`
                      const active = coverBuiltin === value
                      return (
                        <button
                          key={cover}
                          type="button"
                          title={cover}
                          aria-pressed={active}
                          onClick={() => setCoverBuiltin(value)}
                          className={
                            active
                              ? 'h-14 rounded-xl border-2 border-food-primary shadow-foodTab'
                              : 'h-14 rounded-xl border-2 border-food-line shadow-foodSticker transition-all hover:-translate-y-0.5'
                          }
                        >
                          {/* M6：去掉 overflow-hidden → hover 上移时顶部不再被裁；圆角由图片自身承载 */}
                          <img
                            src={value}
                            alt={cover}
                            className="h-full w-full rounded-xl object-cover"
                          />
                        </button>
                      )
                    })}
                  </div>
                ) : null}

                {coverMode === 'favicon' ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-food-muted">
                      输入站点域名，保存后主站通过 /api/favicon 自动抓取（抓不到会回占位图，永不破图）
                    </span>
                    <input
                      value={coverDomain}
                      placeholder="example.com"
                      onChange={(event) => setCoverDomain(event.target.value)}
                      className={FIELD_CLASS}
                    />
                  </label>
                ) : null}

                {coverMode === 'url' ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-food-muted">粘贴任意 http(s) 图片地址</span>
                    <input
                      value={coverUrl}
                      placeholder="https://example.com/cover.jpg"
                      onChange={(event) => setCoverUrl(event.target.value)}
                      className={FIELD_CLASS}
                    />
                  </label>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-food-muted">预览</span>
                <div className="h-[120px] overflow-hidden rounded-2xl border-2 border-food-line bg-food-tagBg ring-2 ring-food-ring">
                  {preview ? (
                    <img src={preview} alt="封面预览" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center px-2 text-center text-xs text-food-muted">
                      主站将显示内置占位插画
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-2xl border-2 border-food-line bg-food-tagBg px-3.5 py-3 transition-colors hover:border-food-primary/50">
          <input
            type="checkbox"
            aria-label="跳过自动检测"
            checked={skipCheck}
            onChange={(event) => setSkipCheck(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-food-primary"
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-rounded text-control font-bold text-food-dark">
              跳过自动检测
            </span>
            <span className="text-xs text-food-muted">
              勾选后 cron / 手动全量 / 单站检测都不再检测该站，状态保持 active（除非手动修改）；
              适用于「浏览器可达但边缘检测失败」的站点，由管理员手动维护。
            </span>
          </span>
        </label>

        {formError ? (
          <p
            role="alert"
            className="mt-4 rounded-2xl border-2 border-food-accent-soft bg-food-tagBg px-3 py-2 text-sm text-food-primary"
          >
            {formError}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border-2 border-food-line bg-food-tagBg px-5 py-2 font-rounded text-control font-bold text-food-dark shadow-foodSticker transition-all hover:-translate-y-0.5"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full border-2 border-food-line bg-food-primary px-6 py-2 font-rounded text-control font-bold text-white shadow-foodTab transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </form>
    </div>
  )
}
