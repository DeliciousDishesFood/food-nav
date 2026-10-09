import { useEffect, useState } from 'react'
import { getCategoryList, navSource } from '../data/navSources.js'

/**
 * 前端 API 客户端（M1）：
 * - fetchNavData() 并行拉取 /api/categories + /api/sites，归一化为 NavGroup 结构
 * - 响应信封校验：json.ok === true && Array.isArray(json.data)，否则视为失败
 * - 3s 超时 / 非 2xx / 网络错误 / JSON 解析失败 → 返回 null（调用方降级本地快照）
 * - useNavData()：首帧即用 navSources.js 快照渲染（永不白屏），接口成功后无缝换后端数据
 * M2 增量：
 * - 分组带 icon（分类 Tab 数据源切 API 后，Tab 图标来自 categories.icon）
 * - coverImg 的 favicon:<域名> 在此转换为 /api/favicon?domain=（组件零改动，永不破图）
 * M6 增量（回页抖动修复）：
 * - localStorage 缓存优先（food-nav:nav-cache，30 分钟 TTL）：首帧直接渲染最近一次真实
 *   API 数据，消除「首帧静态快照 → API 到达硬替换」造成的卡片瞬移/闪动
 * - 接口失败且已有缓存 → 继续用缓存（degraded=false，不弹降级条）；无缓存才降级快照
 */
const FETCH_TIMEOUT_MS = 3000

/** 导航数据缓存键与过期时间（30 分钟） */
export const CACHE_KEY = 'food-nav:nav-cache'
const CACHE_TTL_MS = 30 * 60 * 1000

/** 封面三模式 → 渲染地址：favicon:<域名> 走后端图标代理，其余原样 */
function toCoverSrc(coverImg) {
  const value = typeof coverImg === 'string' ? coverImg : ''
  if (value.startsWith('favicon:')) {
    const domain = value.slice('favicon:'.length).trim()
    return domain ? `/api/favicon?domain=${encodeURIComponent(domain)}` : ''
  }
  return value
}

/** 本地快照分组补 icon（navSources 只有 key/name，Tab 图标靠分类表兜底） */
function withGroupIcons(groups) {
  const iconByKey = new Map(getCategoryList().map((tab) => [tab.key, tab.icon]))
  return groups.map((group) => ({
    ...group,
    icon: group.icon || iconByKey.get(group.categoryKey) || 'sparkles',
  }))
}

/** 首帧 / 降级用的快照（结构与 API 归一化结果同构，含 icon） */
export const SNAPSHOT_GROUPS = withGroupIcons(navSource)

/** 拉取单个接口；非 2xx 或非 JSON 都抛错（由 fetchNavData 统一降级） */
async function getJson(path, signal) {
  const response = await fetch(path, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`http_${response.status}`)
  return response.json()
}

/** 信封校验：{ok:true,data:[]} */
function unwrapList(payload) {
  if (!payload || payload.ok !== true || !Array.isArray(payload.data)) {
    return null
  }
  return payload.data
}

/**
 * 归一化：平铺 sites → 与 navSources.js 同构的 NavGroup 数组
 * [{categoryKey, categoryName, icon, items:[{id,name,desc,url,icon,coverImg,tag}]}]
 * @returns {Array|null} 空数据 / 形状不符时返回 null（降级）
 */
export function normalizeNavData(categories, sites) {
  if (!Array.isArray(categories) || !Array.isArray(sites)) return null
  if (categories.length === 0 || sites.length === 0) return null

  const groups = []
  const groupsByKey = new Map()
  const orderedCategories = [...categories].sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.id ?? 0) - (b.id ?? 0),
  )
  for (const category of orderedCategories) {
    const group = {
      categoryKey: category.key,
      categoryName: category.name,
      icon: category.icon || 'sparkles',
      items: [],
    }
    groups.push(group)
    groupsByKey.set(category.key, group)
  }

  for (const site of sites) {
    const group = groupsByKey.get(site.categoryKey)
    if (!group) continue
    group.items.push({
      id: site.id,
      name: site.name,
      desc: site.desc,
      url: site.url,
      icon: site.icon,
      coverImg: toCoverSrc(site.coverImg),
      tag: site.tag || '',
    })
  }

  // 保留无站点分类（管理员新建分类要先出现在 Tab 上），但整体无站点时降级快照
  const hasAnySite = groups.some((group) => group.items.length > 0)
  return hasAnySite ? groups : null
}

/**
 * 拉取导航数据（分类 + 站点）
 * @returns {Promise<Array|null>} 成功返回 NavGroup 数组；任何失败返回 null
 */
export async function fetchNavData(signal) {
  try {
    const [categories, sites] = await Promise.all([
      getJson('/api/categories', signal),
      getJson('/api/sites?status=active&sort=manual', signal),
    ])
    return normalizeNavData(unwrapList(categories), unwrapList(sites))
  } catch {
    return null
  }
}

/**
 * 读导航缓存（M6）：
 * 结构校验（非空数组 + 每项有 categoryKey/items）+ TTL 过期即忽略；
 * 隐私模式 / localStorage 满 / JSON 损坏一律静默返回 null。
 * @returns {Array|null} 合法缓存分组，否则 null
 */
export function readNavCache(now = Date.now()) {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.savedAt !== 'number') return null
    if (now - parsed.savedAt > CACHE_TTL_MS) return null
    const groups = parsed.groups
    if (!Array.isArray(groups) || groups.length === 0) return null
    const valid = groups.every(
      (group) =>
        group &&
        typeof group.categoryKey === 'string' &&
        Array.isArray(group.items),
    )
    return valid ? groups : null
  } catch {
    return null
  }
}

/** 写导航缓存（M6）：成功返回 true；任何异常静默 false */
export function writeNavCache(groups) {
  try {
    if (!Array.isArray(groups) || groups.length === 0) return false
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), groups }),
    )
    return true
  } catch {
    return false
  }
}

/**
 * 主站导航缓存静默刷新（M6）：管理端改动数据后调用（fire-and-forget），
 * 让「改数据 → 回主页」的首帧直接是最新数据，避免 30 分钟内回页出现旧→新 swap。
 */
export async function refreshNavCache() {
  try {
    const groups = await fetchNavData()
    return groups ? writeNavCache(groups) : false
  } catch {
    return false
  }
}

/**
 * 导航数据源 hook（解耦渲染：useFilterNav 只消费 groups，UI 零改动）
 * @returns {{groups: Array, degraded: boolean}} degraded=true 表示接口失败且无缓存、当前为本地快照
 */
export function useNavData() {
  // 首帧：缓存优先（与后端最近一次数据一致 → 回主页/刷新无 swap），无缓存才用静态快照
  const [state, setState] = useState(() => {
    const cached = readNavCache()
    return { groups: cached || SNAPSHOT_GROUPS, degraded: false }
  })

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    fetchNavData(controller.signal).then((groups) => {
      clearTimeout(timer)
      if (!active) return
      if (groups) {
        writeNavCache(groups)
        setState({ groups, degraded: false })
      } else {
        const cached = readNavCache()
        if (cached) {
          // 有缓存 → 继续用缓存（正常态，不弹降级条）
          setState({ groups: cached, degraded: false })
        } else {
          console.warn('[navApi] 接口不可用，主站使用 navSources 本地快照')
          setState({ groups: SNAPSHOT_GROUPS, degraded: true })
        }
      }
    })

    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [])

  return state
}
