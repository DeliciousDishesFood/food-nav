import { useEffect, useRef, useState } from 'react'
import { PLAYLIST_DEFAULT_LIMIT, fetchPlaylist, fetchSongUrl } from './musicApi.js'
import { FALLBACK_SONGS } from './musicFallback.js'

const MUSIC_KEY = 'food-nav:music'
const VOLUME_KEY = 'food-nav:volume'
const MAX_FAILS = 5
const SAVE_EVERY_SEC = 5
/** 加载更多固定步进：新 limit = 已加载数 + STEP */
const LOAD_MORE_STEP = 10
const LOG_PREFIX = '[useMusicPlayer]'

/** localStorage 读写：隐私模式 / 配额异常静默降级，绝不抛错 */
function readJson(key) {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function writeJson(key, value) {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 降级为会话内状态 */
  }
}

function clamp01(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.min(1, Math.max(0, num))
}

function readVolumeState() {
  const fallback = { volume: 0.8, muted: false }
  try {
    if (typeof window === 'undefined') return fallback
    const raw = window.localStorage.getItem(VOLUME_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'number') {
      return { volume: clamp01(parsed), muted: false }
    }
    if (parsed && typeof parsed === 'object') {
      return {
        volume: parsed.volume === undefined ? 0.8 : clamp01(parsed.volume),
        muted: !!parsed.muted,
      }
    }
  } catch {
    /* 忽略坏数据 */
  }
  return fallback
}

function toSeconds(ms) {
  const num = Number(ms)
  return Number.isFinite(num) && num > 0 ? num / 1000 : 0
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/**
 * 播放状态机：
 * - 歌单：接口成功 → 远程列表；失败 / 空 → 本地 6 首兜底
 * - 取址：songUrl 失败 / 空 / 超时 / audio error → 自动跳下一首
 *   远程歌单全部失败 → 切兜底；连续失败 ≥5 → 停止并提示
 * - 记忆：food-nav:music（曲目 / 是否播放 / 进度）、food-nav:volume（音量 / 静音）
 */
export default function useMusicPlayer(audioRef) {
  const savedRef = useRef(undefined)
  if (savedRef.current === undefined) savedRef.current = readJson(MUSIC_KEY)

  const [songs, setSongs] = useState([])
  const [listState, setListState] = useState('idle')
  const [index, setIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [status, setStatus] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(() => readVolumeState().volume)
  const [muted, setMuted] = useState(() => readVolumeState().muted)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const songsRef = useRef([])
  const indexRef = useRef(-1)
  const listStateRef = useRef('idle')
  const playingRef = useRef(false)
  const timeRef = useRef(0)
  const failRef = useRef(0)
  const tokenRef = useRef(0)
  const failedTokenRef = useRef(-1)
  const lastSaveRef = useRef(-1)
  const listLoadingRef = useRef(false)
  const listSeqRef = useRef(0)
  const listAbortRef = useRef(null)
  const moreLoadingRef = useRef(false)
  const moreSeqRef = useRef(0)
  const moreAbortRef = useRef(null)
  const hasMoreRef = useRef(false)
  const statusRef = useRef('')
  const songAbortRef = useRef(null)
  const pendingSeekRef = useRef(null)
  const resumeTriedRef = useRef(false)
  const mountedRef = useRef(true)
  const volumeRef = useRef(0.8)
  const mutedRef = useRef(false)
  // 首屏实例即为纯 ref 驱动，可长期复用；这样挂载 effect 的依赖数组能保持为空
  const loadPlaylistRef = useRef(loadPlaylist)

  function persistMusic() {
    const song = songsRef.current[indexRef.current]
    if (!song) return
    writeJson(MUSIC_KEY, {
      id: song.id,
      playing: playingRef.current,
      time: Math.round(timeRef.current * 100) / 100,
    })
  }

  function persistVolume() {
    writeJson(VOLUME_KEY, {
      volume: volumeRef.current,
      muted: mutedRef.current,
    })
  }

  function applyList(list, state) {
    songsRef.current = list
    listStateRef.current = state
    setSongs(list)
    setListState(state)
  }

  function setHasMoreState(value) {
    hasMoreRef.current = value
    setHasMore(value)
  }

  /** status 同步一份到 ref：异步回调（如加载更多失败重试）里要判断旧提示 */
  function setStatusText(value) {
    statusRef.current = value
    setStatus(value)
  }

  /** 刷新恢复：按记忆的歌曲 id 定位曲目与进度（是否继续播放由 resumeIfNeeded 决定） */
  function restoreTrack(list) {
    const keep = savedRef.current
    if (!keep || !keep.id) return
    const found = list.findIndex((item) => String(item.id) === String(keep.id))
    const target = found >= 0 ? found : 0
    const time = Number(keep.time)
    indexRef.current = target
    setIndex(target)
    setDuration(toSeconds(list[target].duration))
    if (Number.isFinite(time) && time > 0) {
      pendingSeekRef.current = time
      timeRef.current = time
      setCurrentTime(time)
    }
  }

  async function loadPlaylist() {
    if (listLoadingRef.current || songsRef.current.length > 0) return
    listLoadingRef.current = true
    listSeqRef.current += 1
    const seq = listSeqRef.current
    setListState('loading')
    const controller = new AbortController()
    listAbortRef.current = controller
    const remote = await fetchPlaylist(PLAYLIST_DEFAULT_LIMIT, controller.signal)
    // 请求期间被取消（真实卸载 / StrictMode 重跑 effect）：
    // 共享标记已由发起方清理，这里必须原样退出，不能覆盖新一次加载的状态
    if (seq !== listSeqRef.current) return
    listLoadingRef.current = false
    listAbortRef.current = null
    if (!mountedRef.current) return
    if (remote && remote.length > 0) {
      applyList(remote, 'remote')
      // 首屏可能因接口抖动少于 limit，此时仍允许点一次「加载更多」；
      // 真正的终止判定在 loadMore 内（返回数 < 期望 / 无新歌 → 收起按钮）
      setHasMoreState(true)
    } else {
      applyList(FALLBACK_SONGS, 'local')
      setHasMoreState(false)
      console.warn(LOG_PREFIX, '歌单不可用，已切换本地兜底 6 首')
    }
    const list = songsRef.current
    if (indexRef.current < 0 || indexRef.current >= list.length) {
      restoreTrack(list)
    }
    resumeIfNeeded()
  }

  /**
   * 加载更多：新 limit = 已加载数 + STEP，重拉歌单后按 id 去重只追加新歌。
   * 全程不碰 indexRef / 当前曲目 / 播放进度，绝不打断正在播放的歌曲。
   * 终止判定（防死循环）：本次没有新歌，或接口返回数达不到请求期望（上游封顶）。
   */
  function loadMore() {
    if (!mountedRef.current) return
    if (moreLoadingRef.current) return
    if (listStateRef.current !== 'remote') return
    if (!hasMoreRef.current) return
    const currentLen = songsRef.current.length
    if (currentLen === 0) return
    const want = currentLen + LOAD_MORE_STEP

    moreLoadingRef.current = true
    setLoadingMore(true)
    moreSeqRef.current += 1
    const seq = moreSeqRef.current
    const controller = new AbortController()
    moreAbortRef.current = controller

    void fetchPlaylist(want, controller.signal).then((batch) => {
      // 请求期间被卸载 / 被更新一次请求取代：不碰任何共享状态
      if (seq !== moreSeqRef.current) return
      moreLoadingRef.current = false
      moreAbortRef.current = null
      setLoadingMore(false)
      if (!mountedRef.current) return
      if (!batch) {
        // 只提示、保留 hasMore 供重试：不打断播放、不切兜底
        if (listStateRef.current === 'remote') setStatusText('加载失败，请重试')
        return
      }
      const seen = new Set(songsRef.current.map((song) => song.id))
      const fresh = batch.filter((song) => !seen.has(song.id))
      if (fresh.length > 0) {
        applyList(songsRef.current.concat(fresh), 'remote')
        if (statusRef.current === '加载失败，请重试') setStatusText('')
      }
      setHasMoreState(fresh.length > 0 && batch.length >= want)
      console.log(
        LOG_PREFIX,
        `加载更多：新 ${fresh.length} 首，共 ${songsRef.current.length} 首`,
      )
    })
  }

  /**
   * 刷新恢复：上次是「播放中」→ 歌单就绪后从记忆进度继续。
   * 被浏览器自动播放策略拦截时优雅停在暂停态（startPlayback 里已处理）。
   * 整个生命周期只尝试一次，避免重复拉起。
   */
  function resumeIfNeeded() {
    const keep = savedRef.current
    if (!keep || !keep.playing || resumeTriedRef.current) return
    resumeTriedRef.current = true
    void startIndex(indexRef.current, {
      autoplay: true,
      seekTo: Number(keep.time) || 0,
    })
  }

  function stopAudio() {
    const audio = audioRef.current
    if (!audio) return
    try {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    } catch {
      /* 环境不支持时忽略 */
    }
  }

  function startPlayback() {
    const audio = audioRef.current
    if (!audio) return
    try {
      const promise = audio.play()
      if (promise && typeof promise.catch === 'function') {
        promise.catch((error) => {
          const name = error && error.name
          if (name === 'AbortError') return
          if (name === 'NotAllowedError' || name === 'SecurityError') {
            playingRef.current = false
            setPlaying(false)
            setStatusText('进度已保留，点击播放继续')
            persistMusic()
            return
          }
          console.error(LOG_PREFIX, 'play() 失败：', error)
          handleFail(tokenRef.current)
        })
      }
    } catch (error) {
      console.error(LOG_PREFIX, 'play() 抛错：', error)
      handleFail(tokenRef.current)
    }
  }

  /** 远程歌单全部不可播 → 换本地 6 首，绝不空转 */
  function switchToFallback() {
    applyList(FALLBACK_SONGS, 'local')
    setHasMoreState(false)
    failRef.current = 0
    pendingSeekRef.current = null
    timeRef.current = 0
    lastSaveRef.current = -1
    void startIndex(0, { autoplay: true })
    // startIndex 内部会清一次 status，所以提示必须写在它之后
    setStatusText('远程歌曲不可播，已切到本地歌单')
  }

  function handleFail(token) {
    if (!mountedRef.current) return
    if (token !== tokenRef.current) return
    if (failedTokenRef.current === token) return
    failedTokenRef.current = token
    failRef.current += 1
    console.warn(LOG_PREFIX, `第 ${failRef.current} 次播放失败（自动跳下一首）`)

    const list = songsRef.current
    // 远程地址连续失败到「整批判死」上限 → 立刻切本地兜底，绝不空转。
    // 上限取 min(歌单长度, MAX_FAILS)：歌单再长也不会越过 5 次防死循环红线。
    if (
      listStateRef.current === 'remote' &&
      list.length > 0 &&
      failRef.current >= Math.min(list.length, MAX_FAILS)
    ) {
      switchToFallback()
      return
    }
    if (failRef.current >= MAX_FAILS) {
      console.warn(LOG_PREFIX, '连续失败达到上限，停止自动跳歌')
      setStatusText('歌曲暂时无法播放')
      playingRef.current = false
      setPlaying(false)
      stopAudio()
      return
    }
    void startIndex(indexRef.current + 1, { autoplay: true })
  }

  async function startIndex(rawIndex, options = {}) {
    const autoplay = options.autoplay !== false
    const seekTo = Number(options.seekTo) || 0

    if (songsRef.current.length === 0) await loadPlaylist()
    const list = songsRef.current
    if (list.length === 0) {
      setStatusText('歌单为空，稍后再试')
      return
    }

    const nextIndex =
      ((Math.trunc(rawIndex) % list.length) + list.length) % list.length
    const song = list[nextIndex]

    tokenRef.current += 1
    const token = tokenRef.current
    if (songAbortRef.current) {
      try {
        songAbortRef.current.abort()
      } catch {
        /* 忽略 */
      }
      songAbortRef.current = null
    }

    indexRef.current = nextIndex
    setIndex(nextIndex)
    setStatusText('')
    setDuration(toSeconds(song.duration))
    timeRef.current = seekTo
    pendingSeekRef.current = seekTo > 0 ? seekTo : null
    lastSaveRef.current = -1
    setCurrentTime(seekTo)

    let url = song.url
    if (!url) {
      setResolving(true)
      const controller = new AbortController()
      songAbortRef.current = controller
      url = await fetchSongUrl(song.id, controller.signal)
      songAbortRef.current = null
      if (token !== tokenRef.current) return
    }
    setResolving(false)

    if (!mountedRef.current) return
    if (!url) {
      handleFail(token)
      return
    }

    const audio = audioRef.current
    if (!audio) return
    try {
      audio.src = url
      audio.load()
    } catch (error) {
      console.error(LOG_PREFIX, 'audio 加载失败：', error)
      handleFail(token)
      return
    }
    if (autoplay) startPlayback()
  }

  function ensureList() {
    if (songsRef.current.length === 0) void loadPlaylist()
  }

  function toggle() {
    ensureList()
    const audio = audioRef.current
    failRef.current = 0
    if (indexRef.current < 0) {
      void startIndex(0, { autoplay: true, seekTo: timeRef.current })
      return
    }
    if (!audio) return
    const hasSource = !!audio.getAttribute('src')
    if (!hasSource) {
      void startIndex(indexRef.current, {
        autoplay: true,
        seekTo: timeRef.current,
      })
      return
    }
    if (audio.paused) {
      setStatusText('')
      startPlayback()
    } else {
      audio.pause()
    }
  }

  function next() {
    failRef.current = 0
    void startIndex(indexRef.current + 1, { autoplay: true })
  }

  function prev() {
    failRef.current = 0
    void startIndex(indexRef.current - 1, { autoplay: true })
  }

  function select(target) {
    if (target === indexRef.current) {
      toggle()
      return
    }
    failRef.current = 0
    void startIndex(target, { autoplay: true })
  }

  function seek(value) {
    const next = Math.max(0, Number(value) || 0)
    timeRef.current = next
    setCurrentTime(next)
    const audio = audioRef.current
    if (!audio || !audio.getAttribute('src')) {
      pendingSeekRef.current = next
      return
    }
    try {
      audio.currentTime = next
    } catch {
      pendingSeekRef.current = next
    }
    persistMusic()
  }

  function changeVolume(value) {
    const next = clamp01(value)
    volumeRef.current = next
    setVolume(next)
    if (next > 0 && mutedRef.current) {
      mutedRef.current = false
      setMuted(false)
    }
    const audio = audioRef.current
    if (audio) {
      try {
        audio.volume = next
        audio.muted = mutedRef.current
      } catch {
        /* 忽略 */
      }
    }
    persistVolume()
  }

  function toggleMute() {
    mutedRef.current = !mutedRef.current
    setMuted(mutedRef.current)
    const audio = audioRef.current
    if (audio) {
      try {
        audio.muted = mutedRef.current
      } catch {
        /* 忽略 */
      }
    }
    persistVolume()
  }

  const audioHandlers = {
    onPlay() {
      playingRef.current = true
      setPlaying(true)
      persistMusic()
    },
    onPause() {
      playingRef.current = false
      setPlaying(false)
      persistMusic()
    },
    onPlaying() {
      failRef.current = 0
    },
    onTimeUpdate() {
      const audio = audioRef.current
      if (!audio) return
      timeRef.current = audio.currentTime
      setCurrentTime(audio.currentTime)
      const sec = Math.floor(audio.currentTime)
      if (sec > 0 && sec % SAVE_EVERY_SEC === 0 && lastSaveRef.current !== sec) {
        lastSaveRef.current = sec
        persistMusic()
      }
    },
    onLoadedMetadata() {
      const audio = audioRef.current
      if (!audio) return
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      }
      const seekTo = pendingSeekRef.current
      if (seekTo !== null && seekTo !== undefined) {
        try {
          audio.currentTime = seekTo
        } catch {
          /* 元数据未就绪，忽略 */
        }
        pendingSeekRef.current = null
        timeRef.current = seekTo
        setCurrentTime(seekTo)
      }
    },
    onEnded() {
      void startIndex(indexRef.current + 1, { autoplay: true })
    },
    onError() {
      handleFail(tokenRef.current)
    },
    onVolumeChange() {
      const audio = audioRef.current
      if (!audio) return
      volumeRef.current = audio.volume
      mutedRef.current = audio.muted
      setVolume(audio.volume)
      setMuted(audio.muted)
      persistVolume()
    },
  }

  useEffect(() => {
    mountedRef.current = true
    const init = readVolumeState()
    volumeRef.current = init.volume
    mutedRef.current = init.muted
    const audio = audioRef.current
    if (audio) {
      try {
        audio.volume = init.volume
        audio.muted = init.muted
      } catch {
        /* 忽略 */
      }
    }

    const keep = savedRef.current
    if (keep && keep.id) {
      // 刷新恢复：立即拉歌单，就绪后由 resumeIfNeeded 接管曲目 / 进度 / 播放状态
      // 依赖数组刻意为空：只在挂载时跑一次，内部状态全部走 ref（首屏实例即可长期使用）
      void loadPlaylistRef.current()
    }

    const onPageHide = () => persistMusic()
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      mountedRef.current = false
      // 使在途的歌单请求作废：StrictMode 会立刻重跑本 effect 并重新拉取
      listSeqRef.current += 1
      listLoadingRef.current = false
      moreSeqRef.current += 1
      moreLoadingRef.current = false
      for (const controller of [
        listAbortRef.current,
        songAbortRef.current,
        moreAbortRef.current,
      ]) {
        if (!controller) continue
        try {
          controller.abort()
        } catch {
          /* 忽略 */
        }
      }
      persistMusic()
      if (audio && audio.getAttribute('src')) {
        try {
          audio.pause()
          audio.removeAttribute('src')
          audio.load()
        } catch {
          /* 环境不支持时忽略 */
        }
      }
    }
  }, [audioRef])

  return {
    songs,
    listState,
    index,
    playing,
    resolving,
    status,
    currentTime,
    duration,
    volume,
    muted,
    hasMore,
    loadingMore,
    loadPlaylist,
    loadMore,
    toggle,
    next,
    prev,
    select,
    seek,
    changeVolume,
    toggleMute,
    audioHandlers,
  }
}
