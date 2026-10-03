/**
 * 导航数据源契约（供参考）：
 *
 * @typedef {Object} NavItem
 * @property {string} name 站点名称
 * @property {string} desc 简短描述
 * @property {string} url 跳转地址
 * @property {string} icon lucide 图标名字符串（kebab-case，如 'pizza'，由 morphicons 渲染）
 * @property {string} [coverImg] 【可选】站点/商品预览缩略图地址；为空时组件渲染内置美食占位插画
 * @property {string} [tag] 【可选】卡片角标文案（如「热门」「新品」）；为空时不渲染
 *
 * @typedef {Object} NavGroup
 * @property {string} categoryKey 分类唯一标识
 * @property {string} categoryName 分类展示名称
 * @property {NavItem[]} items 该分类下的导航项
 *
 * @typedef {Object} CategoryTab
 * @property {string} key 分类 key（'all' 表示全部）
 * @property {string} label 分类 tab 文案
 */

export const navSource = [
  {
    categoryKey: 'home-cooking',
    categoryName: '家常菜谱',
    items: [
      {
        name: '下厨房',
        desc: '最受欢迎的中文菜谱社区，海量家常做法',
        url: 'https://www.xiachufang.com/',
        icon: 'cooking-pot',
        coverImg: '/covers/noodle.svg',
        tag: '热门',
      },
      {
        name: '豆果美食',
        desc: '用心发现美食，菜谱与美食家分享',
        url: 'https://www.douguo.com/',
        icon: 'utensils-crossed',
        coverImg: '/covers/dish.svg',
      },
      {
        name: '美食杰',
        desc: '汇集各地家常菜做法与烹饪技巧',
        url: 'https://www.meishij.net/',
        icon: 'soup',
        coverImg: '/covers/noodle.svg',
      },
      {
        name: '心食谱',
        desc: '按食材与菜系查找，做法清晰简单',
        url: 'https://www.xinshipu.com/',
        icon: 'chef-hat',
        coverImg: '/covers/dish.svg',
      },
      {
        name: '日日煮',
        desc: '视觉系料理视频，让下厨更有趣',
        url: 'https://www.daydaycook.com/',
        icon: 'sparkles',
        tag: '新品',
      },
    ],
  },
  {
    categoryKey: 'baking-dessert',
    categoryName: '烘焙甜点',
    items: [
      {
        name: '君之烘焙',
        desc: '经典家庭烘焙博客，配方稳定靠谱',
        url: 'https://www.junzhiblog.com/',
        icon: 'croissant',
        coverImg: '/covers/dessert.svg',
        tag: '推荐',
      },
      {
        name: '烘焙帮',
        desc: '烘焙入门与进阶的配方灵感聚集地',
        url: 'https://www.hongbeibang.com/',
        icon: 'cake',
        coverImg: '/covers/cake.svg',
        tag: '口碑',
      },
      {
        name: 'Tinrry 甜悦家',
        desc: '少女心甜品教程，蛋糕甜品一站式',
        url: 'https://www.tinrry.com/',
        icon: 'cupcake',
        coverImg: '/covers/cake.svg',
      },
      {
        name: '甜品实验室',
        desc: '当季甜点灵感与精致摆盘参考',
        url: 'https://www.dessertlab.cn/',
        icon: 'cookie',
        coverImg: '/covers/dessert.svg',
      },
      {
        name: '冰淇淋星球',
        desc: '季节限定冰淇淋配方与创意口味',
        url: 'https://www.icecreamplanet.cn/',
        icon: 'ice-cream-bowl',
        coverImg: '/covers/icecream.svg',
      },
    ],
  },
  {
    categoryKey: 'delivery',
    categoryName: '外卖到家',
    items: [
      {
        name: '美团外卖',
        desc: '本地生活美食即时送达，品类齐全',
        url: 'https://waimai.meituan.com/',
        icon: 'bike',
        coverImg: '/covers/burger.svg',
        tag: '热门',
      },
      {
        name: '饿了么',
        desc: '餐饮外卖与到店服务，速度优先',
        url: 'https://www.ele.me/',
        icon: 'truck',
        coverImg: '/covers/delivery.svg',
      },
      {
        name: '肯德基',
        desc: '炸鸡汉堡经典款，宅急送在家吃',
        url: 'https://www.kfc.com.cn/',
        icon: 'hamburger',
        coverImg: '/covers/burger.svg',
      },
      {
        name: '麦当劳',
        desc: '经典汉堡与甜品站，App 点餐优惠多',
        url: 'https://www.mcdonalds.com.cn/',
        icon: 'sandwich',
        coverImg: '/covers/fries.svg',
      },
    ],
  },
  {
    categoryKey: 'drinks',
    categoryName: '茶饮咖啡',
    items: [
      {
        name: '瑞幸咖啡',
        desc: '小蓝杯现磨咖啡，性价比之选',
        url: 'https://www.luckincoffee.com/',
        icon: 'coffee',
        coverImg: '/covers/coffee.svg',
        tag: '热门',
      },
      {
        name: '星巴克中国',
        desc: '经典拿铁与季节限定，氛围感拉满',
        url: 'https://www.starbucks.com.cn/',
        icon: 'cup-soda',
        coverImg: '/covers/coffee.svg',
      },
      {
        name: '喜茶',
        desc: '灵感之茶，新式现制茶饮',
        url: 'https://www.heytea.com/',
        icon: 'glass-water',
        coverImg: '/covers/milktea.svg',
      },
      {
        name: '奈雪的茶',
        desc: '茶饮搭配软欧包，下午茶好去处',
        url: 'https://www.naixue.com/',
        icon: 'milk',
        coverImg: '/covers/milktea.svg',
        tag: '新品',
      },
      {
        name: '蜜雪冰城',
        desc: '平价冰淇淋与柠檬水，甜满每一杯',
        url: 'https://www.mixuebingcheng.com/',
        icon: 'ice-cream-cone',
        coverImg: '/covers/icecream.svg',
      },
    ],
  },
  {
    categoryKey: 'groceries',
    categoryName: '生鲜食材',
    items: [
      {
        name: '盒马鲜生',
        desc: '线上下单 30 分钟送达的新鲜超市',
        url: 'https://www.freshhema.com/',
        icon: 'carrot',
        coverImg: '/covers/market.svg',
        tag: '热门',
      },
      {
        name: '叮咚买菜',
        desc: '前置仓极速配送，做饭买菜更省心',
        url: 'https://www.10000.com.cn/',
        icon: 'leafy-green',
        coverImg: '/covers/market.svg',
      },
      {
        name: '京东生鲜',
        desc: '冷链直达，产地好食材当天到家',
        url: 'https://fresh.jd.com/',
        icon: 'fish-symbol',
        coverImg: '/covers/fruit.svg',
      },
      {
        name: '本来生活',
        desc: '全球精品食材，品质生鲜餐桌管家',
        url: 'https://www.benlai.com/',
        icon: 'wheat',
        coverImg: '/covers/fruit.svg',
      },
    ],
  },
]

export function getCategoryList() {
  return [
    { key: 'all', label: '全部', icon: 'sparkles' },
    { key: 'home-cooking', label: '家常菜谱', icon: 'cooking-pot' },
    { key: 'baking-dessert', label: '烘焙甜点', icon: 'cake' },
    { key: 'delivery', label: '外卖到家', icon: 'bike' },
    { key: 'drinks', label: '茶饮咖啡', icon: 'coffee' },
    { key: 'groceries', label: '生鲜食材', icon: 'carrot' },
  ]
}
