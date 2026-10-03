const PLAYLIST_API =
  'https://node.api.xfabe.com/api/wangyi/userSongs?uid=18441576713&limit='
const SONG_URL_API = 'https://node.api.xfabe.com/api/wangyi/music?type=json&id='
const LYRIC_API = 'https://node.api.xfabe.com/api/wangyi/lyrics?id='

/** 首屏歌单条数；实测 limit=15→15 首、limit=25→22 首（该歌单总量 22），故分页可行 */
export const PLAYLIST_DEFAULT_LIMIT = 15
/** 接口上限保护：上游在 limit≥25 后恒返回 22 首，无需再放大 */
const PLAYLIST_MAX_LIMIT = 100
const FETCH_TIMEOUT_MS = 5000
const LOG_PREFIX = '[musicApi]'

/** 错误分类：abort=外部取消 timeout=超时 http=状态码异常 parse=JSON 异常 empty=空响应 network=断网/CORS */
function makeError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

async function requestJson(url, signal) {
  const controller = new AbortController()
  const timer = window.setTimeout(
    () => controller.abort(makeError('timeout', '请求超时')),
    FETCH_TIMEOUT_MS,
  )
  const onOuterAbort = () => controller.abort(makeError('abort', '请求已取消'))
  if (signal) {
    if (signal.aborted) onOuterAbort()
    else signal.addEventListener('abort', onOuterAbort, { once: true })
  }

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw makeError('http', `HTTP ${response.status}`)
    const raw = await response.text()
    const text = raw.replace(/^\uFEFF/, '').trim()
    if (!text) throw makeError('empty', '响应为空')
    try {
      return JSON.parse(text)
    } catch {
      throw makeError('parse', 'JSON 解析失败')
    }
  } catch (error) {
    if (error && error.code) throw error
    if (error && error.name === 'AbortError') {
      throw makeError(signal && signal.aborted ? 'abort' : 'timeout', '请求中断')
    }
    throw makeError('network', String(error && error.message))
  } finally {
    window.clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onOuterAbort)
  }
}

/**
 * 拉取网易云歌单（接口与 uid 见任务文档）。
 * limit 参数化实现「加载更多」分页：首屏 15，加载更多按 已加载数+10 放大。
 * 成功返回规范化歌曲数组；失败 / 超时 / 返回为空返回 null（由调用方决定兜底）。
 */
export async function fetchPlaylist(limit = PLAYLIST_DEFAULT_LIMIT, signal) {
  const size = Number(limit)
  const safe =
    Number.isFinite(size) && size > 0
      ? Math.min(Math.trunc(size), PLAYLIST_MAX_LIMIT)
      : PLAYLIST_DEFAULT_LIMIT
  try {
    const data = await requestJson(`${PLAYLIST_API}${safe}`, signal)
    const raw = Array.isArray(data && data.data && data.data.songs)
      ? data.data.songs
      : []
    const songs = raw
      .filter((item) => item && item.id !== undefined && item.id !== null)
      .map((item) => ({
        id: String(item.id),
        name: String(item.name || '未知歌曲'),
        artist: String(item.artistsname || '未知歌手'),
        cover: String(item.picurl || ''),
        duration: Number(item.duration) || 0,
        url: '',
      }))
    if (songs.length === 0) {
      console.warn(LOG_PREFIX, '歌单接口返回空列表', data)
      return null
    }
    console.log(LOG_PREFIX, `歌单拉取成功：limit=${safe}，${songs.length} 首`)
    return songs
  } catch (error) {
    if (!error || error.code !== 'abort') {
      console.error(LOG_PREFIX, '歌单拉取失败，将走本地兜底：', error)
    }
    return null
  }
}

/**
 * 通过歌曲 id 换取真实播放地址。
 * 任务文档给出的 /api/wangyi/songUrl 实测 404，
 * 实际可用路径为 /api/wangyi/music?type=json&id=<id>（返回 data.url）。
 */
export async function fetchSongUrl(id, signal) {
  try {
    const data = await requestJson(
      `${SONG_URL_API}${encodeURIComponent(id)}`,
      signal,
    )
    const url = data && data.data ? data.data.url : null
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) return url
    console.warn(LOG_PREFIX, 'songUrl 返回空 / 非法地址：', id, data)
    return null
  } catch (error) {
    if (!error || error.code !== 'abort') {
      console.error(LOG_PREFIX, 'songUrl 获取失败：', id, error)
    }
    return null
  }
}

/**
 * 解析标准 LRC 歌词文本 → [{ time(秒), text }]（按时间升序）。
 * 容忍空行 / 元信息行 / 多时间戳行；无有效行返回空数组。
 */
export function parseLrc(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return []
  const result = []
  for (const line of raw.split(/\r?\n/)) {
    const timestamps = [...line.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)]
    if (timestamps.length === 0) continue
    const text = line.replace(/\[[^\]]*\]/g, '').trim()
    if (!text) continue
    for (const m of timestamps) {
      const minutes = Number(m[1])
      const seconds = Number(m[2])
      let frac = m[3] ? Number(m[3]) : 0
      // 毫秒字段可能是 1~3 位，统一折算为毫秒
      while (frac >= 1000) frac /= 10
      const time = minutes * 60 + seconds + frac / 1000
      if (Number.isFinite(time) && time >= 0) result.push({ time, text })
    }
  }
  result.sort((a, b) => a.time - b.time)
  return result
}

/**
 * 拉取网易云歌词（LRC 文本）。
 * 成功返回解析后的 [{time,text}]；失败 / 无歌词返回空数组（调用方按无歌词处理）。
 * 兜底本地歌曲（fb-*）无歌词，直接返回空数组。
 */
export async function fetchLyrics(id, signal) {
  if (typeof id === 'string' && id.startsWith('fb-')) return []
  try {
    const data = await requestJson(`${LYRIC_API}${encodeURIComponent(id)}`, signal)
    const raw = data && data.data ? data.data.lyric : ''
    const list = parseLrc(raw)
    if (list.length === 0) {
      console.warn(LOG_PREFIX, '歌词为空 / 无法解析：', id)
      return []
    }
    console.log(LOG_PREFIX, `歌词获取成功：${id}，${list.length} 行`)
    return list
  } catch (error) {
    if (!error || error.code !== 'abort') {
      console.error(LOG_PREFIX, '歌词获取失败：', id, error)
    }
    return []
  }
}
