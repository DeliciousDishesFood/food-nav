/**
 * M6 · AI 页文案池与随机生成（新建文件）
 * 纯数据/纯函数，零依赖；供 AskChat（空态问候 + 建议 chips）与 AskPage（侧栏灵感）共用。
 * 分类名来自 navApi 的 SNAPSHOT_GROUPS（静态快照，禁新接口，不额外发请求）。
 * 规则：chips 每次随机 3-4 个、文案不使用「有什么…推荐吗？」句式。
 */
import { SNAPSHOT_GROUPS } from '../api/navApi.js'

/** 输入框 placeholder 轮换池（≥8 条场景化短语，非固定设问句） */
export const PLACEHOLDER_POOL = [
  '深夜想吃点甜的？',
  '搜个靠谱的菜谱网站',
  '今天晚饭没头绪',
  '烘焙新手第一步',
  '找家附近的奶茶店',
  '解释一个烘焙名词',
  '冰箱清库存大作战',
  '想吃点不用开火的',
  '周末烤个蛋糕试试',
  '外卖点什么不会踩雷',
]

/** 聚焦态（优先级最高）与流式态 placeholder */
export const PLACEHOLDER_FOCUS = '问我任何关于美食的问题…'
export const PLACEHOLDER_STREAMING = '美食 AI 正在回答…'

/** 空态问候池（≥5 条，进入时随机取一条） */
const GREETING_POOL = [
  '今天想吃点什么？',
  '厨房难题交给我～',
  '来聊聊晚饭吃什么吧',
  '饿了就先问问看',
  '有什么想做的甜点吗？',
  '先吃点好的，再谈别的',
]

/** 「分类名 × 动作」动作模板（组合后不含「有什么…推荐吗？」句式） */
const ACTION_TEMPLATES = [
  (name) => `逛逛${name}`,
  (name) => `${name}灵感库`,
  (name) => `挖一挖${name}好站`,
  (name) => `${name}工具箱`,
  (name) => `今天想看${name}`,
  (name) => `${name}急救包`,
]

/** 随机短句池（与分类组合结果混合使用） */
const RANDOM_PROMPTS = [
  '烘焙名词小课堂',
  '深夜甜品灵感站',
  '冰箱剩菜大改造',
  '奶茶点单避雷指南',
  '零失败早餐搭配',
  '烤箱新手入门课',
  '夏天解暑饮品单',
  '一人食快手菜谱',
]

/** Fisher–Yates 洗牌（返回新数组） */
function shuffle(list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** 随机取一 */
function pickOne(list) {
  return list[Math.floor(Math.random() * list.length)]
}

/** 分类 → 表情（侧栏「今日美味」与推荐卡片共用） */
export const CATEGORY_EMOJI = {
  'home-cooking': '🍳',
  'baking-dessert': '🧁',
  delivery: '🛵',
  drinks: '🧋',
  groceries: '🥬',
}

/** 空态问候：每次进入随机一条 */
export function pickGreeting() {
  return pickOne(GREETING_POOL)
}

/** 建议 chips：分类名 × 动作 + 随机池混合，去重后随机 3-4 个 */
export function pickChips(count = 3 + Math.floor(Math.random() * 2)) {
  const names = SNAPSHOT_GROUPS.map((group) => String(group.categoryName || '').trim()).filter(Boolean)
  const fromCategories = shuffle(names)
    .slice(0, 4)
    .map((name) => pickOne(ACTION_TEMPLATES)(name))
  const candidates = [...new Set([...fromCategories, ...shuffle(RANDOM_PROMPTS)])]
  const size = Math.max(3, Math.min(count, 4))
  return shuffle(candidates).slice(0, size)
}

/** 「今日美味」：从静态快照里随机挑 count 个站点（侧栏展示，禁新接口） */
export function pickDailySites(count = 3) {
  const items = SNAPSHOT_GROUPS.flatMap((group) =>
    (group.items || []).map((item) => ({
      ...item,
      categoryKey: group.categoryKey,
      categoryName: group.categoryName,
    })),
  )
  return shuffle(items).slice(0, count)
}
