import { useSyncExternalStore } from 'react'
import { STORAGE_KEYS, readList, writeList } from '../utils/storage.js'

/**
 * 模块级收藏状态：任意组件（卡片爱心 / 分类标签 / 筛选逻辑）共享同一份数据
 *
 * M9 收藏服务端化：localStorage 仍是权威缓存（离线可用、刷新保留），
 * 同步层负责 initFavoritesSync（GET 服务端列表 → 并集合并 → 待上传项补传）
 * 与 toggleFavorite（乐观更新 → PUT/DELETE → 服务端拒绝才回滚；断网保留本地）。
 * NavCard 契约不变：isFavorite(name) / toggleFavorite(name) / useFavorites()。
 */

/** 前端签名 key：与服务端 FAVORITE_SALT（pages secret）必须同值；随 JS 公开，只防顺手改包 */
const FAVORITE_SALT = 'food-nav-fav-2026'

/** 模块级收藏状态：本地权威缓存 */
let favorites = readList(STORAGE_KEYS.favorites)
const listeners = new Set()
/** name → siteId（HomePage 注入；查不到 id 的收藏只走本地，不上传） */
let siteIndex = new Map()
let initialized = false

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit() {
  for (const listener of listeners) listener()
}

function persist(next) {
  favorites = next
  writeList(STORAGE_KEYS.favorites, favorites)
  emit()
}

export function isFavorite(name) {
  return favorites.includes(name)
}

/** NavGroup → name→siteId 索引（站点改名后旧 name 查不到 id → 仅本地保留，属预期） */
export function setSiteIndex(groups) {
  const map = new Map()
  const list = Array.isArray(groups) ? groups : []
  for (const group of list) {
    const items = group && Array.isArray(group.items) ? group.items : []
    for (const item of items) {
      if (item && item.id !== undefined && item.id !== null && typeof item.name === 'string') {
        map.set(item.name, item.id)
      }
    }
  }
  siteIndex = map
}

/** 读 fv_id cookie（middleware 种的一年期匿名标识；缺失 = 仅本地模式） */
function readFvId() {
  try {
    const match = /(?:^|;\s*)fv_id=([^;]*)/.exec(document.cookie)
    return match && match[1] ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

/** 轻签名：sha256hex(fv_id + salt) 前 32 位；无 Web Crypto 返回 null（请求照发，服务端按 bad_sign 拒） */
async function favSign(fvId) {
  try {
    const subtle = globalThis.crypto && globalThis.crypto.subtle
    if (!subtle) return null
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(fvId + FAVORITE_SALT))
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32)
  } catch {
    return null
  }
}

/**
 * 收藏写请求（PUT 收藏 / DELETE 取消）
 * @returns {Promise<boolean|null>} true = 服务端确认；false = 服务端拒绝（调用方回滚）；
 *   null = 网络不可达（断网 / 后端挂 → 保留本地，下次 initFavoritesSync 合并补传）
 */
async function requestFavorite(siteId, favorited, fvId) {
  const headers = { 'content-type': 'application/json', Accept: 'application/json' }
  const sign = await favSign(fvId)
  if (sign) headers['X-Fav-Sign'] = sign
  let response
  try {
    response = await fetch(`/api/favorites/${siteId}`, {
      method: favorited ? 'PUT' : 'DELETE',
      headers,
      body: JSON.stringify({ visitor_id: fvId }),
      keepalive: true,
    })
  } catch {
    return null
  }
  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  return response.ok && payload && payload.ok === true ? true : false
}

export function toggleFavorite(name) {
  const before = favorites
  const willFavorite = !before.includes(name)
  // 1) 本地乐观更新 + 写 storage + emit（原逻辑，立即响应，离线也可用）
  persist(willFavorite ? [...before, name] : before.filter((item) => item !== name))
  // 2) 服务端同步（异步，不阻塞交互）
  void syncToggle(name, willFavorite)
}

async function syncToggle(name, willFavorite) {
  const siteId = siteIndex.get(name)
  const fvId = readFvId()
  if (siteId === undefined || siteId === null || !fvId) return // 无 id / 无 cookie：纯本地

  const result = await requestFavorite(siteId, willFavorite, fvId)
  if (result === null) {
    console.warn('[favorites] 离线同步失败，收藏暂存本地（恢复后合并补传）')
    return
  }
  if (result === true) return

  // 服务端拒绝（4xx/5xx/坏信封）→ 回滚本地：只撤销本次这一项，
  // 避免用整表覆盖用户后续的其它并发操作
  const current = favorites
  const has = current.includes(name)
  if (willFavorite && has) {
    persist(current.filter((item) => item !== name))
  } else if (!willFavorite && !has) {
    persist([...current, name])
  } else {
    return // 状态已被后续操作改掉，不再回滚
  }
  console.warn('[favorites] 同步失败，已回滚')
}

/**
 * App 挂载时调用一次：GET 服务端列表 → 与本地并集合并（不丢收藏）→ 本地新增项逐个补传
 * 任何失败（断网 / 接口挂 / 401）都退化为纯本地模式，静默不弹错
 */
export function initFavoritesSync() {
  if (initialized) return
  initialized = true
  void syncFromServer()
}

async function syncFromServer() {
  const fvId = readFvId()
  if (!fvId) return // 无 cookie：纯本地（降级，不报错）

  let serverList = null
  try {
    const response = await fetch('/api/favorites', { headers: { Accept: 'application/json' } })
    const payload = await response.json()
    if (
      !response.ok ||
      !payload ||
      payload.ok !== true ||
      !Array.isArray(payload.data)
    ) {
      throw new Error('bad_envelope')
    }
    serverList = payload.data.filter((item) => item && typeof item.name === 'string')
  } catch {
    return // 断网 / 接口挂：纯本地模式（不弹错误，下次 init 再合并）
  }

  const serverNames = new Set(serverList.map((item) => item.name))
  const localNames = new Set(favorites)
  const merged = [...favorites]
  for (const item of serverList) {
    // 服务端有而本地无 → 加入本地（并集合并，不丢收藏）
    if (!localNames.has(item.name)) merged.push(item.name)
  }
  // 本地有而服务端无 → 待上传（改名站点查不到 id 的，下面按 siteIndex 跳过）
  const pending = merged.filter((name) => !serverNames.has(name))

  if (merged.length !== favorites.length) {
    persist(merged) // 写回 food-nav:favorites + emit
  }

  for (const name of pending) {
    const siteId = siteIndex.get(name)
    if (siteId === undefined || siteId === null) continue // 无 id：不上传，本地保留
    const result = await requestFavorite(siteId, true, fvId)
    if (result === null) break // 网络不可达：其余项必然同样失败，静默退出（下次 init 再合并）
    // 单项被拒（如站点已删除）：静默跳过，继续补传其余项
  }
}

/** 返回当前收藏列表快照（引用稳定，仅在变更时更新） */
export function useFavorites() {
  return useSyncExternalStore(subscribe, () => favorites, () => favorites)
}
