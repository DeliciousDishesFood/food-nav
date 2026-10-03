import { useEffect, useState } from 'react'
import { TOAST_EVENT } from '../utils/toast.js'

const TOAST_DURATION = 2000

/** 全站唯一的 toast 挂载点（放在 Layout 里） */
export default function ToastHost() {
  const [message, setMessage] = useState('')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timer = 0
    const handler = (event) => {
      setMessage(String(event.detail ?? ''))
      setVisible(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setVisible(false), TOAST_DURATION)
    }
    window.addEventListener(TOAST_EVENT, handler)
    return () => {
      window.removeEventListener(TOAST_EVENT, handler)
      window.clearTimeout(timer)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-toast-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border-2 border-food-line bg-food-primary px-5 py-2 font-rounded text-control font-bold text-white shadow-foodTab"
    >
      {message}
    </div>
  )
}
