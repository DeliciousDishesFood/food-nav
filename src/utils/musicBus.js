import { useSyncExternalStore } from 'react'

/**
 * 播放器 → 打字机 的轻量状态桥：
 * MusicPlayer 播放状态变化时写入，TypeWriterQuote 订阅后切换
 * 「播放中展示歌词 / 歌曲信息 / 一言句子」三种模式。
 * 独立新文件，不改动播放器状态机本身。
 */

const EMPTY = { playing: false, song: null, lyricsState: 'none', lyrics: null }
let musicState = EMPTY
const listeners = new Set()

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit() {
  for (const listener of listeners) listener()
}

/**
 * 由 MusicPlayer 调用：同步当前播放状态（切歌 / 播放 / 暂停 / 歌词就绪都更新）。
 * lyricsState：loading=歌词拉取中 none=无歌词/失败（走一言） ready=歌词就绪
 */
export function setMusicState(next) {
  const song = next && next.song ? next.song : null
  const playing = !!(next && next.playing && song)
  const lyricsState = next && next.lyricsState ? next.lyricsState : 'none'
  const lyrics = next && Array.isArray(next.lyrics) ? next.lyrics : null
  const changed =
    musicState.playing !== playing ||
    musicState.lyricsState !== lyricsState ||
    (song
      ? !musicState.song || song.id !== musicState.song.id
      : !!musicState.song)
  if (!changed) return
  musicState = { playing, song, lyricsState, lyrics }
  emit()
}

/** TypeWriterQuote 订阅：返回稳定引用，仅在播放状态 / 歌曲 / 歌词状态变化时更新 */
export function useMusicState() {
  return useSyncExternalStore(subscribe, () => musicState, () => musicState)
}
