import { useState } from 'react'
import { adminLogin, errorMessage, saveStoredToken } from './AdminApi.js'

/**
 * 登录页（贴纸风卡片）：密码 → POST /api/admin/login → token 写 localStorage → 进面板
 * 错误密码 401 提示；锁定 429 展示锁定文案；503 提示未配置
 */
export default function AdminLogin({ onAuthenticated }) {
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    if (!password) {
      setMessage('请输入管理密码')
      return
    }
    setBusy(true)
    setMessage('')
    const { status, payload } = await adminLogin(password)
    if (payload.ok === true && payload.data && payload.data.token) {
      saveStoredToken(payload.data.token, payload.data.expiresAt)
      setBusy(false)
      onAuthenticated()
      return
    }
    setBusy(false)
    if (status === 503) {
      setMessage(errorMessage(payload, '服务端未配置 ADMIN_PASSWORD / ADMIN_SECRET'))
      return
    }
    setMessage(errorMessage(payload, '登录失败，请重试'))
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border-2 border-food-line bg-food-surface p-6 shadow-foodSticker">
        <div className="mb-5 flex flex-col items-center gap-1 text-center">
          <span aria-hidden="true" className="text-food-sun">
            ✦
          </span>
          <h1 className="font-display text-section-title text-food-dark">食光管理台</h1>
          <p className="text-card-desc text-food-muted">输入管理密码，开始打理你的美食导航</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-rounded text-control font-bold text-food-dark">管理密码</span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              placeholder="请输入密码"
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border-2 border-food-line bg-food-surface2 px-3.5 py-2.5 text-control text-food-dark outline-none transition-shadow placeholder:text-food-muted focus:shadow-foodFocus"
            />
          </label>

          {message ? (
            <p
              role="alert"
              className="rounded-2xl border-2 border-food-accent-soft bg-food-tagBg px-3 py-2 text-sm text-food-primary"
            >
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-food-line bg-food-primary px-5 py-2.5 font-rounded text-control font-bold text-white shadow-foodTab transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:shadow-foodFocus"
          >
            {busy ? '登录中…' : '登录'}
          </button>
        </form>
      </div>

      <a
        href="#/"
        className="font-rounded text-control text-food-muted transition-colors hover:text-food-primary"
      >
        ← 回到食光导航
      </a>
    </div>
  )
}
