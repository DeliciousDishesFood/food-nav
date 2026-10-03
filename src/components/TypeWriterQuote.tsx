import { useEffect, useState } from 'react'
import { useMusicState } from '../utils/musicBus.js'

type TypeWriterQuoteProps = {
  className?: string
}

const DIRECT_URL = 'https://quote.shiora.cc/api/hitokoto?type=a'
const API_PATH = '/api/hitokoto?type=a'
/** CORS 友好的公益一言接口：自建源直连跨域失败时兜底（Access-Control-Allow-Origin: * 实测可用） */
const HITOKOTO_URL = 'https://v1.hitokoto.cn/?c=a'

/**
 * 接口地址解析（源站不返回 CORS 头，浏览器直连会 200 OK 却读不到数据）：
 * 1. 配置了 VITE_QUOTE_PROXY（Cloudflare Worker 代理）→ 走代理读取
 * 2. 本地开发 → 走 Vite 同源代理 /quote-api
 * 3. 都没有 → 直连尝试（跨域失败后由 hitokoto.cn 兜底）
 */
function resolveEndpoint(): string {
  const proxy = import.meta.env.VITE_QUOTE_PROXY
  if (proxy) return `${proxy.replace(/\/+$/, '')}${API_PATH}`
  if (import.meta.env.DEV) return `/quote-api${API_PATH}`
  return DIRECT_URL
}

const API_URL = resolveEndpoint()
const FETCH_TIMEOUT_MS = 3000 // 单源 3 秒超时兜底
const TYPE_SPEED_MS = 70 // 打字速度
const HOLD_MS = 20000 // 每句停留 20 秒
const LOG_PREFIX = '[TypeWriterQuote]'

/** 本地动漫风备用句子：接口不可用 / 超时 / 失败时上屏，保证永不空白 */
const FALLBACK_QUOTES = [
  '愿你三餐有味，四季无忧，日子甜得像草莓大福。',
  '把烦恼交给风，把好胃口留给自己。',
  '慢一点也没关系，热腾腾的饭菜会等你。',
  '今天的你，也值得一份甜甜的小确幸。',
  '生活偶尔会咸，但下一勺一定是甜的。',
  '愿你的努力都有回报，像布丁一样duangduang的。',
]

/** 兼容 BOM / 字符串包裹 / JSON 被截断等异常，尽量从原始文本里抠出句子 */
function extractQuote(raw: string): string | null {
  const text = raw.replace(/^\uFEFF/, '').trim()
  if (!text) return null

  try {
    const data = JSON.parse(text) as { hitokoto?: unknown }
    const hitokoto =
      typeof data?.hitokoto === 'string' ? data.hitokoto.trim() : ''
    if (hitokoto) return hitokoto
    console.warn(LOG_PREFIX, 'JSON 解析成功但缺少 hitokoto 字段：', data)
  } catch (error) {
    console.error(LOG_PREFIX, 'res.json() 解析失败：', error)
  }

  const matched = /"hitokoto"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text)
  if (matched?.[1]) {
    try {
      const value = JSON.parse(`"${matched[1]}"`) as string
      console.log(LOG_PREFIX, '已从原始文本正则兜底提取句子')
      return value.trim() || null
    } catch {
      return matched[1].trim() || null
    }
  }
  return null
}

/**
 * 句子端点链（按序尝试，任一成功即返回）：
 * ① 自己的接口（VITE_QUOTE_PROXY / Vite 开发代理 / quote.shiora.cc 直连）
 * ② 跨域被拦或失败 → CORS 友好的公益一言 hitokoto.cn
 * ③ 全部失败 → 返回 null，由调用方走本地兜底
 */
async function fetchQuote(): Promise<string | null> {
  for (const url of [API_URL, HITOKOTO_URL]) {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      console.log(
        LOG_PREFIX,
        'response：',
        url,
        response.status,
        response.type,
        response.headers.get('content-type'),
      )
      if (!response.ok) {
        console.warn(LOG_PREFIX, '接口状态异常，尝试下一源：', url, response.status)
        continue
      }
      const raw = await response.text()
      const quote = extractQuote(raw)
      if (!quote) {
        console.warn(LOG_PREFIX, '无法读取响应数据，尝试下一源：', url, raw.slice(0, 160))
        continue
      }
      console.log(LOG_PREFIX, '句子获取成功：', url)
      return quote
    } catch (error) {
      console.error(LOG_PREFIX, '请求失败 / 超时，尝试下一源：', url, error)
    } finally {
      window.clearTimeout(timer)
    }
  }
  return null
}

export default function TypeWriterQuote({
  className = '',
}: TypeWriterQuoteProps) {
  // 播放器状态：播放中优先展示歌词（失败回一言），非播放恢复一言句子
  const { playing, song, lyricsState, lyrics } = useMusicState()
  // 首屏立即上屏本地句子，接口结果作为第一轮打字内容
  const [typed, setTyped] = useState(FALLBACK_QUOTES[0])
  // 读屏友好：动态打字区 aria-hidden，整句完成后由 sr-only 播报一次，避免逐字打断
  const [srSentence, setSrSentence] = useState(FALLBACK_QUOTES[0])

  useEffect(() => {
    let active = true
    let typeTimer = 0
    let holdTimer = 0
    let lyricTimer = 0
    let fallbackIndex = 1
    let lastLyricIndex = -1

    function typeOut(text: string, options: { hold?: boolean } = {}) {
      const hold = options.hold !== false
      // 新句接管前清掉旧打字 / 停留定时器，避免多个 interval 竞争 setTyped
      window.clearInterval(typeTimer)
      window.clearTimeout(holdTimer)
      // 按码点切分，避免 emoji/生僻字被截断成乱码
      const chars = Array.from(text)
      let i = 1
      setTyped(chars.slice(0, i).join(''))
      typeTimer = window.setInterval(() => {
        i += 1
        setTyped(chars.slice(0, i).join(''))
        if (i >= chars.length) {
          window.clearInterval(typeTimer)
          setSrSentence(text)
          if (hold) {
            holdTimer = window.setTimeout(() => {
              void cycle()
            }, HOLD_MS)
          }
        }
      }, TYPE_SPEED_MS)
    }

    async function cycle() {
      const remote = await fetchQuote()
      if (!active) return
      if (!remote) console.warn(LOG_PREFIX, '本轮使用本地备用句子')
      const quote =
        remote ??
        FALLBACK_QUOTES[fallbackIndex++ % FALLBACK_QUOTES.length]
      typeOut(quote)
    }

    if (playing && song) {
      if (lyricsState === 'ready' && lyrics && lyrics.length > 0) {
        // 歌词模式：轮询 audio 当前时间，切行时打字机重打该行
        function renderLyricLine() {
          const audio = document.querySelector('audio')
          const time =
            audio && Number.isFinite(audio.currentTime)
              ? audio.currentTime
              : 0
          let idx = -1
          for (let i = 0; i < lyrics.length; i += 1) {
            if (lyrics[i].time <= time) idx = i
            else break
          }
          if (idx !== lastLyricIndex) {
            lastLyricIndex = idx
            if (idx >= 0) typeOut(lyrics[idx].text, { hold: false })
          }
        }
        renderLyricLine()
        lyricTimer = window.setInterval(renderLyricLine, 300)
      } else if (lyricsState === 'none') {
        // 播放中但无歌词（接口失败 / 纯音乐 / 兜底歌曲）→ 走一言句子
        void cycle()
      } else {
        // 歌词拉取中：歌名过渡
        typeOut(`♪ ${song.name} — ${song.artist}`, { hold: false })
      }
    } else {
      // 非播放（含刚暂停）：本地句立即上屏，远程句到达后无缝替换，不残留歌曲/歌词
      typeOut(FALLBACK_QUOTES[fallbackIndex++ % FALLBACK_QUOTES.length])
      void fetchQuote().then((remote) => {
        if (!active || !remote) return
        typeOut(remote)
      })
    }

    return () => {
      active = false
      window.clearInterval(typeTimer)
      window.clearTimeout(holdTimer)
      window.clearInterval(lyricTimer)
    }
  }, [playing, song, lyricsState, lyrics])

  // 播放中且非「走一言」态（歌词 ready / 歌名 loading）→ 无引号包裹
  const isSongMode = playing && song && lyricsState !== 'none'

  return (
    <p
      className={`line-clamp-2 min-h-[46px] w-full text-center text-sm italic leading-relaxed text-pink-500/80 dark:text-pink-400/80 ${className}`}
      aria-live="off"
    >
      {isSongMode ? (
        <>
          <span aria-hidden="true">{typed}</span>
        </>
      ) : (
        <>
          <span aria-hidden="true">「</span>
          <span aria-hidden="true">{typed}</span>
          <span aria-hidden="true">」</span>
        </>
      )}
      <span className="sr-only" role="status">
        {srSentence}
      </span>
    </p>
  )
}
