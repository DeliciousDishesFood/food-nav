const TOAST_EVENT = 'food-nav:toast'

/** 任意组件内调用即可弹出轻量 toast：showToast('复制成功') */
export function showToast(message) {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: message }))
}

export { TOAST_EVENT }
