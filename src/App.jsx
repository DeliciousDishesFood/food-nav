import { useEffect, useState } from 'react'
import HomePage from './pages/HomePage.jsx'
import NotFound from './pages/NotFound.jsx'

/** 归一化路径：去掉末尾斜杠与 index.html，根路径返回 '/' */
function normalizePath(pathname) {
  return pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/'
}

/** 当前路由：优先读 hash（#/xxx 形式对静态托管刷新友好），否则读 pathname */
function getPath() {
  const hash = window.location.hash
  if (hash.startsWith('#/')) return normalizePath(hash.slice(1))
  return normalizePath(window.location.pathname)
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

  return path === '/' ? <HomePage /> : <NotFound />
}

export default App
