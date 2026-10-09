import { useEffect, useState } from 'react'
import AdminLogin from './AdminLogin.jsx'
import AdminShell from './AdminShell.jsx'
import { ADMIN_LOGOUT_EVENT, clearStoredToken, readStoredToken } from './AdminApi.js'

/**
 * 管理面板容器：本地无有效 token → 登录页；有 → 面板
 * token 存 localStorage['food-nav:admin-token'] = {token, expiresAt}
 */
export default function AdminPage() {
  const [authed, setAuthed] = useState(() => readStoredToken() !== null)

  useEffect(() => {
    const onLogout = () => setAuthed(false)
    window.addEventListener(ADMIN_LOGOUT_EVENT, onLogout)
    return () => window.removeEventListener(ADMIN_LOGOUT_EVENT, onLogout)
  }, [])

  const logout = () => {
    clearStoredToken()
    setAuthed(false)
  }

  return authed ? (
    <AdminShell onLogout={logout} />
  ) : (
    <AdminLogin onAuthenticated={() => setAuthed(true)} />
  )
}
