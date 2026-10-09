-- 食光导航 · D1 初始化迁移（M1）
-- 依据：dev-docs/architecture/02-backend-design.md §1 + 03-m1-backend-detail.md §3.2
-- 种子数据来源：src/data/navSources.js（23 站 / 5 分类，逐字段对齐）
-- 幂等：建表用 IF NOT EXISTS，种子用显式 id + INSERT OR REPLACE，可重复执行

-- ---------- 1. 分类表 ----------
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'sparkles',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- 2. 站点表 ----------
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  desc TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'globe',
  cover_img TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  fail_count INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- 3. 站点统计表（热度，M3/M4 使用；每站一行） ----------
CREATE TABLE IF NOT EXISTS site_stats (
  site_id INTEGER PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0,
  heat_score INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sites_category ON sites(category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);

-- ---------- 4. 种子数据：5 分类 ----------
INSERT OR REPLACE INTO categories (id, key, name, icon, sort_order) VALUES
  (1, 'home-cooking',   '家常菜谱', 'cooking-pot', 0),
  (2, 'baking-dessert', '烘焙甜点', 'cake',        1),
  (3, 'delivery',       '外卖到家', 'bike',        2),
  (4, 'drinks',         '茶饮咖啡', 'coffee',      3),
  (5, 'groceries',      '生鲜食材', 'carrot',      4);

-- ---------- 5. 种子数据：23 站 ----------
INSERT OR REPLACE INTO sites
  (id, category_id, name, desc, url, icon, cover_img, tag, sort_order, status) VALUES
  (1,  1, '下厨房',       '最受欢迎的中文菜谱社区，海量家常做法', 'https://www.xiachufang.com/',    'cooking-pot',     '/covers/noodle.svg',  '热门', 0, 'active'),
  (2,  1, '豆果美食',     '用心发现美食，菜谱与美食家分享',       'https://www.douguo.com/',        'utensils-crossed', '/covers/dish.svg',    '',     1, 'active'),
  (3,  1, '美食杰',       '汇集各地家常菜做法与烹饪技巧',         'https://www.meishij.net/',       'soup',             '/covers/noodle.svg',  '',     2, 'active'),
  (4,  1, '心食谱',       '按食材与菜系查找，做法清晰简单',       'https://www.xinshipu.com/',      'chef-hat',         '/covers/dish.svg',    '',     3, 'active'),
  (5,  1, '日日煮',       '视觉系料理视频，让下厨更有趣',         'https://www.daydaycook.com/',    'sparkles',         '',                    '新品', 4, 'active'),
  (6,  2, '君之烘焙',     '经典家庭烘焙博客，配方稳定靠谱',       'https://www.junzhiblog.com/',    'croissant',        '/covers/dessert.svg', '推荐', 0, 'active'),
  (7,  2, '烘焙帮',       '烘焙入门与进阶的配方灵感聚集地',       'https://www.hongbeibang.com/',   'cake',             '/covers/cake.svg',    '口碑', 1, 'active'),
  (8,  2, 'Tinrry 甜悦家','少女心甜品教程，蛋糕甜品一站式',      'https://www.tinrry.com/',        'cupcake',          '/covers/cake.svg',    '',     2, 'active'),
  (9,  2, '甜品实验室',   '当季甜点灵感与精致摆盘参考',           'https://www.dessertlab.cn/',     'cookie',           '/covers/dessert.svg', '',     3, 'active'),
  (10, 2, '冰淇淋星球',   '季节限定冰淇淋配方与创意口味',         'https://www.icecreamplanet.cn/','ice-cream-bowl',   '/covers/icecream.svg','',     4, 'active'),
  (11, 3, '美团外卖',     '本地生活美食即时送达，品类齐全',       'https://waimai.meituan.com/',    'bike',             '/covers/burger.svg',  '热门', 0, 'active'),
  (12, 3, '饿了么',       '餐饮外卖与到店服务，速度优先',         'https://www.ele.me/',            'truck',            '/covers/delivery.svg','',     1, 'active'),
  (13, 3, '肯德基',       '炸鸡汉堡经典款，宅急送在家吃',         'https://www.kfc.com.cn/',        'hamburger',        '/covers/burger.svg',  '',     2, 'active'),
  (14, 3, '麦当劳',       '经典汉堡与甜品站，App 点餐优惠多',     'https://www.mcdonalds.com.cn/',  'sandwich',         '/covers/fries.svg',   '',     3, 'active'),
  (15, 4, '瑞幸咖啡',     '小蓝杯现磨咖啡，性价比之选',           'https://www.luckincoffee.com/',  'coffee',           '/covers/coffee.svg',  '热门', 0, 'active'),
  (16, 4, '星巴克中国',   '经典拿铁与季节限定，氛围感拉满',       'https://www.starbucks.com.cn/',  'cup-soda',         '/covers/coffee.svg',  '',     1, 'active'),
  (17, 4, '喜茶',         '灵感之茶，新式现制茶饮',               'https://www.heytea.com/',        'glass-water',      '/covers/milktea.svg','',     2, 'active'),
  (18, 4, '奈雪的茶',     '茶饮搭配软欧包，下午茶好去处',         'https://www.naixue.com/',        'milk',             '/covers/milktea.svg','新品', 3, 'active'),
  (19, 4, '蜜雪冰城',     '平价冰淇淋与柠檬水，甜满每一杯',       'https://www.mixuebingcheng.com/','ice-cream-cone',   '/covers/icecream.svg','',     4, 'active'),
  (20, 5, '盒马鲜生',     '线上下单 30 分钟送达的新鲜超市',       'https://www.freshhema.com/',     'carrot',           '/covers/market.svg',  '热门', 0, 'active'),
  (21, 5, '叮咚买菜',     '前置仓极速配送，做饭买菜更省心',       'https://www.10000.com.cn/',      'leafy-green',      '/covers/market.svg',  '',     1, 'active'),
  (22, 5, '京东生鲜',     '冷链直达，产地好食材当天到家',         'https://fresh.jd.com/',          'fish-symbol',      '/covers/fruit.svg',   '',     2, 'active'),
  (23, 5, '本来生活',     '全球精品食材，品质生鲜餐桌管家',       'https://www.benlai.com/',        'wheat',            '/covers/fruit.svg',   '',     3, 'active');

-- ---------- 6. 站点统计初始值：每站一行 0 值 ----------
INSERT OR REPLACE INTO site_stats (site_id, favorite_count, click_count, heat_score) VALUES
  (1, 0, 0, 0),  (2, 0, 0, 0),  (3, 0, 0, 0),  (4, 0, 0, 0),  (5, 0, 0, 0),
  (6, 0, 0, 0),  (7, 0, 0, 0),  (8, 0, 0, 0),  (9, 0, 0, 0),  (10, 0, 0, 0),
  (11, 0, 0, 0), (12, 0, 0, 0), (13, 0, 0, 0), (14, 0, 0, 0), (15, 0, 0, 0),
  (16, 0, 0, 0), (17, 0, 0, 0), (18, 0, 0, 0), (19, 0, 0, 0), (20, 0, 0, 0),
  (21, 0, 0, 0), (22, 0, 0, 0), (23, 0, 0, 0);
