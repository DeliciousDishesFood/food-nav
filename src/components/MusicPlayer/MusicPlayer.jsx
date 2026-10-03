import { useEffect, useRef, useState } from 'react'
import { MorphIcon } from 'morphicons/react'
import {
  ChevronDown,
  ListMusic,
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide'
import useMusicPlayer, { formatTime } from './useMusicPlayer.js'
import { fetchLyrics } from './musicApi.js'
import { setMusicState } from '../../utils/musicBus.js'

/** 歌词缓存：歌曲 id → 解析后数组（空数组也缓存，避免反复请求无歌词歌曲） */
const lyricsCache = new Map()

const CONTROL_BTN =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-food-line bg-food-tagBg text-food-dark shadow-foodSticker transition-all duration-200 hover:-translate-y-0.5 hover:text-food-primary focus:outline-none focus-visible:shadow-foodFocus'

const PLAY_BTN =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-food-line bg-food-primary text-white shadow-foodTab transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:shadow-foodFocus'

/** 右下角悬浮音乐播放器：默认收起、不自动播放（浏览器策略），z-40 不压 toast/导航栏 */
export default function MusicPlayer() {
  const audioRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const player = useMusicPlayer(audioRef)
  const {
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
  } = player

  const current = index >= 0 && index < songs.length ? songs[index] : null
  const cover = current && current.cover ? current.cover : ''
  const maxTime = duration > 0 ? duration : 0
  const sliderTime =
    maxTime > 0 ? Math.min(currentTime, maxTime) : 0
  const listLabel =
    listState === 'remote'
      ? `网易云 · ${songs.length} 首`
      : listState === 'local'
        ? `本地 · ${songs.length} 首`
        : listState === 'loading'
          ? '拉取中…'
          : '未加载'

  const openPanel = () => {
    setExpanded(true)
    void player.loadPlaylist()
  }

  // 把播放状态 + 歌词同步给打字机：
  // 播放中 → 尝试拉歌词（有歌词打字机滚动歌词，无歌词走一言）；暂停 → 立即恢复一言
  useEffect(() => {
    const song = current
      ? { id: current.id, name: current.name, artist: current.artist }
      : null
    if (!current || !playing) {
      setMusicState({ playing, song, lyricsState: 'none', lyrics: null })
      return
    }
    const cached = lyricsCache.get(current.id)
    if (cached !== undefined) {
      setMusicState({
        playing,
        song,
        lyricsState: cached.length > 0 ? 'ready' : 'none',
        lyrics: cached.length > 0 ? cached : null,
      })
      return
    }
    // 拉取中先展示歌名过渡，成功后切歌词模式
    setMusicState({ playing, song, lyricsState: 'loading', lyrics: null })
    const controller = new AbortController()
    void fetchLyrics(current.id, controller.signal).then((list) => {
      const has = Array.isArray(list) && list.length > 0
      lyricsCache.set(current.id, has ? list : [])
      setMusicState({
        playing,
        song,
        lyricsState: has ? 'ready' : 'none',
        lyrics: has ? list : null,
      })
    })
    return () => controller.abort()
  }, [playing, current])

  return (
    <>
      <audio ref={audioRef} preload="metadata" {...player.audioHandlers} />

      {expanded ? (
        <section
          aria-label="音乐播放器面板"
          className="fixed bottom-6 right-6 z-40 flex max-h-[calc(100vh_-_6rem)] w-[320px] max-w-[calc(100vw_-_2rem)] flex-col overflow-hidden rounded-[20px] border-2 border-food-line bg-white/85 shadow-foodHeader backdrop-blur-md dark:bg-[#241A33]/85"
        >
          {/* 面板头部：标题 + 歌单来源 + 收起 */}
          <div className="flex shrink-0 items-center gap-2 border-b-2 border-food-soft px-3 py-2.5">
            <MorphIcon
              icon={Music}
              size={16}
              strokeWidth={2.2}
              className="shrink-0 text-food-primary"
            />
            <span className="font-rounded text-sm font-bold text-food-dark">
              食光电台
            </span>
            <span className="ml-auto max-w-[96px] truncate text-[11px] text-food-muted">
              {listLabel}
            </span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="收起音乐播放器"
              title="收起"
              className={CONTROL_BTN}
            >
              <MorphIcon icon={ChevronDown} size={18} strokeWidth={2.2} />
            </button>
          </div>

          {/* 封面 + 歌名 + 歌手 */}
          <div className="flex shrink-0 items-center gap-3 px-4 py-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 border-food-line bg-food-tagBg shadow-foodSticker">
              <span className="relative flex h-full w-full items-center justify-center text-food-primary">
                <MorphIcon icon={Music} size={22} strokeWidth={2.2} />
                {cover ? (
                  <img
                    src={cover}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : null}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-rounded text-card-title font-bold text-food-dark">
                {current ? current.name : '点一首歌，开始下厨吧'}
              </p>
              <p className="mt-0.5 truncate text-xs text-food-muted">
                {current ? current.artist : '音乐陪你度过每一餐 ♪'}
              </p>
              {resolving ? (
                <p className="mt-0.5 truncate text-[11px] text-food-primary">
                  正在获取播放地址…
                </p>
              ) : null}
            </div>
          </div>

          {/* 可拖拽进度条 */}
          <div className="flex shrink-0 items-center gap-2 px-4 pb-1">
            <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-food-muted">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={maxTime}
              step={0.5}
              value={sliderTime}
              disabled={maxTime <= 0}
              onChange={(event) => player.seek(event.target.value)}
              aria-label="播放进度"
              className="h-4 min-w-0 flex-1 cursor-pointer accent-food-primary disabled:cursor-not-allowed disabled:opacity-40"
            />
            <span className="w-10 shrink-0 text-[11px] tabular-nums text-food-muted">
              {formatTime(maxTime)}
            </span>
          </div>

          {/* 播放控制 + 音量 */}
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={player.prev}
                aria-label="上一首"
                title="上一首"
                className={CONTROL_BTN}
              >
                <MorphIcon icon={SkipBack} size={18} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onClick={player.toggle}
                aria-label={playing ? '暂停' : '播放'}
                title={playing ? '暂停' : '播放'}
                className={PLAY_BTN}
              >
                <MorphIcon
                  icon={playing ? Pause : Play}
                  size={22}
                  strokeWidth={1.8}
                  fill="currentColor"
                />
              </button>
              <button
                type="button"
                onClick={player.next}
                aria-label="下一首"
                title="下一首"
                className={CONTROL_BTN}
              >
                <MorphIcon icon={SkipForward} size={18} strokeWidth={2.2} />
              </button>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={player.toggleMute}
                aria-label={muted ? '取消静音' : '静音'}
                title={muted ? '取消静音' : '静音'}
                className={CONTROL_BTN}
              >
                <MorphIcon
                  icon={muted || volume === 0 ? VolumeX : Volume2}
                  size={18}
                  strokeWidth={2.2}
                />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(event) => player.changeVolume(event.target.value)}
                aria-label="音量"
                className="h-4 w-16 cursor-pointer accent-food-primary"
              />
            </div>
          </div>

          {/* 失败 / 降级提示 */}
          {status ? (
            <p
              aria-live="polite"
              className="shrink-0 border-t-2 border-food-soft bg-food-tagBg px-4 py-2 text-[11px] text-food-primary"
            >
              {status}
            </p>
          ) : null}

          {/* 歌单列表：点击切歌，当前播放高亮 */}
          <div className="no-scrollbar min-h-0 max-h-44 flex-1 overflow-y-auto border-t-2 border-food-soft px-2 py-2">
            {listState === 'loading' ? (
              <p className="px-2 py-6 text-center text-xs text-food-muted">
                正在拉取歌单…
              </p>
            ) : songs.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-food-muted">
                歌单空空的，稍后再试
              </p>
            ) : (
              songs.map((song, songIndex) => {
                const active = songIndex === index
                return (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => player.select(songIndex)}
                    aria-label={`播放 ${song.name}`}
                    className={`flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors duration-200 focus:outline-none focus-visible:shadow-foodFocus ${
                      active
                        ? 'bg-food-soft'
                        : 'hover:bg-food-tagBg dark:hover:bg-food-surface2'
                    }`}
                  >
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border-2 border-food-line bg-food-tagBg">
                      <span className="relative flex h-full w-full items-center justify-center text-food-primary">
                        <MorphIcon icon={Music} size={14} strokeWidth={2.2} />
                        {song.cover ? (
                          <img
                            src={song.cover}
                            alt=""
                            onError={(event) => {
                              event.currentTarget.style.display = 'none'
                            }}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : null}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate font-rounded text-sm font-bold ${
                          active ? 'text-food-primary' : 'text-food-dark'
                        }`}
                      >
                        {song.name}
                      </span>
                      <span className="block truncate text-[11px] text-food-muted">
                        {song.artist}
                      </span>
                    </span>
                    {active ? (
                      <MorphIcon
                        icon={ListMusic}
                        size={16}
                        strokeWidth={2.2}
                        className={
                          playing ? 'shrink-0 text-food-primary' : 'shrink-0 text-food-muted'
                        }
                      />
                    ) : null}
                  </button>
                )
              })
            )}

            {/* 分页加载更多：仅网易云歌单态；无更多时收起，失败时只提示不打断播放 */}
            {listState === 'remote' && songs.length > 0 && hasMore ? (
              <button
                type="button"
                onClick={() => player.loadMore()}
                disabled={loadingMore}
                aria-label="加载更多歌曲"
                title={loadingMore ? '加载中' : '加载更多'}
                className="mx-auto mt-2 flex w-full items-center justify-center gap-1 rounded-full border-2 border-food-line bg-food-tagBg px-3 py-1.5 text-[11px] font-bold text-food-primary shadow-foodSticker transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:shadow-foodFocus dark:bg-food-surface2"
              >
                {loadingMore ? '加载中…' : '加载更多 ♪'}
              </button>
            ) : null}
            {listState === 'remote' && songs.length > 0 && !hasMore && !loadingMore ? (
              <p className="px-2 py-2 text-center text-[11px] text-food-muted">已全部加载</p>
            ) : null}
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={openPanel}
          aria-label="展开音乐播放器"
          title="音乐播放器"
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border-2 border-food-line bg-white/70 text-food-primary shadow-foodHeader backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:shadow-foodFocus dark:bg-[#241A33]/75"
        >
          <MorphIcon
            icon={Music}
            size={22}
            strokeWidth={2.2}
            className={
              playing ? 'motion-safe:animate-spin [animation-duration:3s]' : ''
            }
          />
          {playing ? (
            <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-food-mint ring-2 ring-food-line" />
          ) : null}
        </button>
      )}
    </>
  )
}
