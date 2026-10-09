import { useCallback, useEffect, useState } from 'react'
import { MorphIcon } from 'morphicons/react'
import { iconRegistry } from '../icons/registry.js'
import IconPicker from './IconPicker.jsx'
import {
  createCategory,
  errorMessage,
  fetchAllSites,
  fetchCategories,
  removeCategory,
  updateCategory,
} from './AdminApi.js'

const KEY_PATTERN = /^[a-z0-9-]+$/
const RESERVED_KEYS = ['all', 'favorites']
const FIELD_CLASS =
  'w-full rounded-2xl border-2 border-food-line bg-food-surface2 px-3.5 py-2.5 text-control text-food-dark outline-none transition-shadow placeholder:text-food-muted focus:shadow-foodFocus'

const EMPTY_FORM = { key: '', name: '', icon: '', sortOrder: '0' }

/** 分类管理：增 / 改 / 删（key 不可改，删除二次确认并提示级联站点） */
export default function AdminCategories() {
  const [categories, setCategories] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    () =>
      Promise.all([fetchCategories(), fetchAllSites()]).then(
        ([categoriesRes, sitesRes]) => {
          if (categoriesRes.payload.ok === true && Array.isArray(categoriesRes.payload.data)) {
            setCategories(categoriesRes.payload.data)
            setError('')
          } else {
            setError(errorMessage(categoriesRes.payload))
          }
          if (sitesRes.payload.ok === true && Array.isArray(sitesRes.payload.data)) {
            setSites(sitesRes.payload.data)
          }
          setLoading(false)
        },
      ),
    [],
  )

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (category) => {
    setEditingId(category.id)
    setForm({
      key: category.key,
      name: category.name,
      icon: category.icon,
      sortOrder: String(category.sortOrder ?? 0),
    })
    setFormError('')
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingId(null)
    setFormError('')
  }

  const validate = () => {
    const key = form.key.trim()
    const name = form.name.trim()
    if (!editingId) {
      if (!key) return '分类 key 必填'
      if (!KEY_PATTERN.test(key)) return 'key 只能由小写字母 / 数字 / 连字符组成'
      if (RESERVED_KEYS.includes(key)) return `"${key}" 是主站保留标识，不能用作分类 key`
    }
    if (!name) return '分类名称必填'
    if ([...name].length > 20) return '分类名称不能超过 20 字'
    if (!form.icon) return '请先选择分类图标'
    const order = Number(form.sortOrder)
    if (!Number.isInteger(order) || order < 0) return '排序必须是 ≥0 的整数'
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
      name: form.name.trim(),
      icon: form.icon,
      sortOrder: Number(form.sortOrder),
      ...(editingId ? {} : { key: form.key.trim() }),
    }
    const { payload } = editingId
      ? await updateCategory(editingId, body)
      : await createCategory(body)
    setBusy(false)
    if (payload.ok === true) {
      closeForm()
      load()
      return
    }
    setFormError(errorMessage(payload))
  }

  const handleDelete = async (category) => {
    const count = sites.filter((site) => site.categoryId === category.id).length
    const confirmed = window.confirm(
      `删除分类「${category.name}」将同时删除该分类下的 ${count} 个站点，且主站对应 Tab 会一并消失，确定删除？`,
    )
    if (!confirmed) return
    const { payload } = await removeCategory(category.id)
    if (payload.ok === true) {
      setCategories((current) => current.filter((item) => item.id !== category.id))
    } else {
      setError(errorMessage(payload))
    }
  }

  const siteCount = (categoryId) =>
    sites.filter((site) => site.categoryId === categoryId).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-rounded text-control text-food-muted">
          分类决定主站 Tab；新增后主站立即出现，删除后 Tab 与站点一并消失。
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-full border-2 border-food-line bg-food-primary px-5 py-2 font-rounded text-control font-bold text-white shadow-foodTab transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:shadow-foodFocus"
        >
          + 新增分类
        </button>
      </div>

      {error ? (
        <p className="rounded-2xl border-2 border-food-accent-soft bg-food-tagBg px-4 py-2.5 text-control text-food-primary">
          {error}
        </p>
      ) : null}

      {formOpen ? (
        <form
          onSubmit={submit}
          className="rounded-3xl border-2 border-food-line bg-food-surface p-4 shadow-foodSticker"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-rounded text-card-title font-bold text-food-dark">
              {editingId ? '编辑分类' : '新增分类'}
            </h2>
            <button
              type="button"
              aria-label="关闭表单"
              onClick={closeForm}
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-food-line bg-food-tagBg text-food-muted shadow-foodSticker transition-colors hover:text-food-primary"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-rounded text-control font-bold text-food-dark">
                key <span className="text-food-primary">*</span>
              </span>
              <input
                value={form.key}
                disabled={Boolean(editingId)}
                placeholder="home-cooking"
                onChange={(event) => setForm({ ...form, key: event.target.value })}
                className={`${FIELD_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
              />
              <span className="text-xs text-food-muted">
                {editingId ? 'key 为路由标识，创建后不可修改' : '小写字母 / 数字 / 连字符'}
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-rounded text-control font-bold text-food-dark">
                名称 <span className="text-food-primary">*</span>
              </span>
              <input
                value={form.name}
                maxLength={20}
                placeholder="如：家常菜谱"
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className={FIELD_CLASS}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-rounded text-control font-bold text-food-dark">排序</span>
              <input
                value={form.sortOrder}
                type="number"
                min={0}
                step={1}
                onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
                className={FIELD_CLASS}
              />
            </label>

            <div className="flex flex-col gap-1.5 md:col-span-3">
              <span className="font-rounded text-control font-bold text-food-dark">
                图标 <span className="text-food-primary">*</span>
              </span>
              <IconPicker
                value={form.icon}
                onChange={(icon) => setForm({ ...form, icon })}
              />
            </div>
          </div>

          {formError ? (
            <p
              role="alert"
              className="mt-4 rounded-2xl border-2 border-food-accent-soft bg-food-tagBg px-3 py-2 text-sm text-food-primary"
            >
              {formError}
            </p>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeForm}
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
      ) : null}

      <div className="overflow-x-auto rounded-3xl border-2 border-food-line bg-food-surface shadow-foodSticker">
        <table className="w-full min-w-[620px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-food-line bg-food-surface2 font-rounded text-control text-food-muted">
              <th className="px-3 py-2.5 font-bold">分类</th>
              <th className="px-3 py-2.5 font-bold">key</th>
              <th className="px-3 py-2.5 font-bold">图标</th>
              <th className="px-3 py-2.5 font-bold">排序</th>
              <th className="px-3 py-2.5 font-bold">站点数</th>
              <th className="px-3 py-2.5 text-right font-bold">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-food-muted">
                  分类加载中…
                </td>
              </tr>
            ) : categories.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-food-muted">
                  还没有分类
                </td>
              </tr>
            ) : (
              categories.map((category) => (
                <tr
                  key={category.id}
                  className="border-b border-food-accent-soft last:border-b-0 hover:bg-food-surface2"
                >
                  <td className="px-3 py-2.5 font-rounded font-bold text-food-dark">
                    {category.name}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-food-muted">{category.key}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2 text-food-dark">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl border-2 border-food-line bg-food-tagBg text-food-primary">
                        <MorphIcon
                          icon={iconRegistry[category.icon] || iconRegistry.sparkles}
                          size={16}
                          strokeWidth={2.2}
                        />
                      </span>
                      <span className="text-xs text-food-muted">{category.icon}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-food-muted">{category.sortOrder}</td>
                  <td className="px-3 py-2.5 text-food-muted">{siteCount(category.id)}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(category)}
                        className="rounded-full border-2 border-food-line bg-food-tagBg px-3 py-1 font-rounded text-xs font-bold text-food-dark shadow-foodSticker transition-all hover:-translate-y-0.5 hover:text-food-primary"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(category)}
                        className="rounded-full border-2 border-food-line bg-food-surface px-3 py-1 font-rounded text-xs font-bold text-food-primary shadow-foodSticker transition-all hover:-translate-y-0.5"
                      >
                        删除
                      </button>
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
