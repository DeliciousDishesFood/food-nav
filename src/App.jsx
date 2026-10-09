import { Suspense, lazy, useEffect, useState } from 'react'
import HomePage from './pages/HomePage.jsx'
import NotFound from './pages/NotFound.jsx'
import AdminFallback from './admin/AdminFallback.jsx'
import SakuraBurst from './components/effects/SakuraBurst.jsx'
import { initFavoritesSync } from './hooks/useFavorites.js'
import './styles/route-fade.css'

// 管理面板独立 chunk：仅访问 /admin 时才加载（与主站零耦合）
const AdminPage = lazy(() => import('./admin/AdminPage.jsx'))
// M5 AI 问答独立 chunk：仅访问 /ask 时才加载（首页不含任何 AI 代码）
const AskPage = lazy(() => import('./ask/AskPage.jsx'))

/** 去掉查询串（支持 #/ask?q=xxx 深链，路由只认路径部分） */
function stripQuery(value) {
  const index = value.indexOf('?')
  return index >= 0 ? value.slice(0, index) : value
}

/** 归一化路径：去掉末尾斜杠与 index.html，根路径返回 '/' */
function normalizePath(pathname) {
  return pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/'
}

/** 当前路由：优先读 hash（#/xxx 形式对静态托管刷新友好），否则读 pathname */
function getPath() {
  const hash = window.location.hash
  if (hash.startsWith('#/')) return normalizePath(stripQuery(hash.slice(1)))
  return normalizePath(window.location.pathname)
}

/* ===== M4 热度埋点（全局委托，主站组件目录零改动） ===== */

/** 同一 URL 点击防抖窗口（ms） */
const CLICK_DEBOUNCE_MS = 300

/** 上报（fire-and-forget：失败/被限频都静默，绝不影响页面交互） */
function report(url, payload) {
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* 隐私模式 / 老浏览器：忽略 */
  }
}

function App() {
  const [path, setPath] = useState(() => getPath())

  useEffect(() => {
    const syncPath = () => setPath(getPath())
    window.addEventListener('popstate', syncPath)
    window.addEventListener('hashchange', syncPath)
    return () => {
      window.removeEventListener('popstate', syncPath)
      window.removeEventListener('hashchange', syncPath)
    }
  }, [])

  // M4 埋点：点击上报（捕获阶段委托）
  // M9 起收藏上报（原 MutationObserver aria-pressed false→true → /api/track/favorite）已停用：
  // ① 只增不减是 M4 缺陷 ② favorite_count 现由 /api/favorites PUT/DELETE 原子维护，保留上报会双计。
  useEffect(() => {
    let lastClick = { url: '', at: 0 }

    const onClick = (event) => {
      try {
        const target = event.target
        const anchor =
          target && typeof target.closest === 'function'
            ? target.closest('a[href^="http"]')
            : null
        if (!anchor) return
        const href = anchor.href
        if (!href || !/^https?:/i.test(href)) return
        if (href.indexOf(window.location.origin) === 0) return // 同源链接不计
        const now = Date.now()
        if (lastClick.url === href && now - lastClick.at < CLICK_DEBOUNCE_MS) return
        lastClick = { url: href, at: now }
        report('/api/track/click', { url: href })
      } catch {
        /* 埋点异常绝不打断点击 */
      }
    }
    document.addEventListener('click', onClick, true)

    return () => {
      document.removeEventListener('click', onClick, true)
    }
  }, [])

  // M9 收藏服务端化：挂载即与服务端并集合并 + 补传（独立 effect，不并进埋点 effect）
  useEffect(() => {
    initFavoritesSync()
  }, [])

  // M10 路由切换轻淡入：key={path} 变化 → 路由外壳重挂载并触发一次 180ms 淡入
  // （仅淡入、不遮挡、不延迟渲染；reduced-motion 由 CSS 关闭）
  let content
  if (path === '/') content = <HomePage />
  else if (path === '/ask') {
    content = (
      <Suspense fallback={<AdminFallback />}>
        <AskPage />
      </Suspense>
    )
  } else if (path === '/admin') {
    content = (
      <Suspense fallback={<AdminFallback />}>
        <AdminPage />
      </Suspense>
    )
  } else content = <NotFound />

  return (
    <>
      <div key={path} className="route-fade">
        {content}
      </div>
      {/* M10 全局点击樱花散花（捕获阶段、不阻止默认行为；reduced-motion 不触发） */}
      <SakuraBurst />
    </>
  )
}

export default App
