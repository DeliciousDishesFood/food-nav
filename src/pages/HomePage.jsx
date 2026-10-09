import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout/Layout.jsx'
import Header from '../components/Layout/Header.jsx'
import DailyFortune from '../components/DailyFortune/DailyFortune.jsx'
import Footer from '../components/Layout/Footer.jsx'
import CategoryTabs from '../components/CategoryTabs.jsx'
import NavGroup from '../components/NavCard/NavGroup.jsx'
import EmptyTip from '../components/EmptyTip.jsx'
import { FAVORITES_CATEGORY, useFilterNav } from '../hooks/useFilterNav.js'
import { setSiteIndex, useFavorites } from '../hooks/useFavorites.js'
import { useNavData } from '../api/navApi.js'
import '../styles/fade.css'

export default function HomePage() {
  // 数据源：API 成功用后端数据，失败/超时降级 navSources 本地快照（永不白屏）
  const { groups, degraded } = useNavData()

  // M9：name→site_id 索引注入收藏同步层（卡片爱心仍只调 toggleFavorite，组件零改动）
  useEffect(() => {
    setSiteIndex(groups)
  }, [groups])
  const [snapshotNoticeDismissed, setSnapshotNoticeDismissed] = useState(false)
  const {
    searchText,
    setSearchText,
    activeCategoryKey,
    setActiveCategoryKey,
    filteredNavList,
  } = useFilterNav(groups)
  const favorites = useFavorites()

  // 标签数据源（M2）：从后端分类分组派生 → 管理员新增/删除分类，主站 Tab 即时同步
  const categoryTabs = useMemo(
    () => [
      { key: 'all', label: '全部', icon: 'sparkles' },
      { key: FAVORITES_CATEGORY, label: '我的收藏', icon: 'heart' },
      ...groups.map((group) => ({
        key: group.categoryKey,
        label: group.categoryName,
        icon: group.icon,
      })),
    ],
    [groups],
  )

  const isFavoritesEmpty =
    activeCategoryKey === FAVORITES_CATEGORY &&
    favorites.length === 0 &&
    filteredNavList.length === 0

  // 搜索词生效时统计结果数量（仅作提示，不参与过滤逻辑）
  const isSearching = searchText.trim().length > 0
  const resultCount = useMemo(
    () => filteredNavList.reduce((count, group) => count + group.items.length, 0),
    [filteredNavList],
  )

  return (
    <Layout>
      <Header value={searchText} onChange={setSearchText} />

      {/* task-23：今日签贴纸卡（打字机正下方；groups 为空时组件 render null） */}
      <DailyFortune groups={groups} />

      {degraded && !snapshotNoticeDismissed ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border-2 border-food-accent-soft bg-food-surface px-4 py-2.5 font-rounded text-control text-food-muted shadow-foodSticker">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="text-food-sun">
              ✦
            </span>
            数据加载失败，显示本地快照
          </span>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => setSnapshotNoticeDismissed(true)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-food-line bg-food-tagBg text-food-muted transition-colors hover:text-food-primary focus:outline-none focus-visible:shadow-foodFocus"
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* M5：AI 问答入口（放在 Header 搜索区附近；位于 main 之外，不影响 Tabs 语义） */}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => {
            window.location.hash = '#/ask'
          }}
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-food-line bg-food-surface px-4 py-2 font-rounded text-control font-bold text-food-primary shadow-foodSticker transition-all duration-200 hover:-translate-y-0.5 hover:shadow-foodCard focus:outline-none focus-visible:shadow-foodFocus"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-4 w-4 shrink-0"
            fill="none"
            stroke="#FF8FB1"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {[0, 72, 144, 216, 288].map((deg) => (
              <path
                key={deg}
                d="M12 12c-2.5-1.7-3.2-5.1-.7-7.9.4-.5 1.2-.5 1.6 0 2.5 2.8 1.8 6.2-.9 7.9z"
                transform={`rotate(${deg} 12 12)`}
              />
            ))}
            <circle cx="12" cy="12" r="1.5" fill="#FF8FB1" stroke="none" />
          </svg>
          问问樱见
        </button>
      </div>

      <main className="mt-6 flex-1">
        <div className="mb-7">
          <CategoryTabs
            tabs={categoryTabs}
            activeKey={activeCategoryKey}
            onChange={setActiveCategoryKey}
          />
        </div>

        {isSearching && filteredNavList.length > 0 ? (
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border-2 border-food-accent-soft bg-food-surface px-4 py-1.5 font-rounded text-control text-food-muted shadow-foodSticker">
            <span aria-hidden="true" className="text-food-sun">
              ✦
            </span>
            找到
            <span className="font-bold text-food-primary">{resultCount}</span>
            个美味结果
          </div>
        ) : null}

        {filteredNavList.length === 0 ? (
          <EmptyTip
            title={isFavoritesEmpty ? '还没有收藏的小站 ♡' : undefined}
            desc={
              isFavoritesEmpty
                ? '点一下卡片右上角的爱心，它就会出现在这里啦'
                : undefined
            }
          />
        ) : (
          // key 只随分类切换变化 → 搜索过滤不换 key（打字不闪），切换分类时触发 fade-up
          <div key={activeCategoryKey} className="category-fade space-y-9">
            {filteredNavList.map((group) => (
              <NavGroup
                key={group.categoryKey}
                groupTitle={group.categoryName}
                itemList={group.items}
              />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </Layout>
  )
}
