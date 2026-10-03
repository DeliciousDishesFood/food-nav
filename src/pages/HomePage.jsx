import { useMemo } from 'react'
import Layout from '../components/Layout/Layout.jsx'
import Header from '../components/Layout/Header.jsx'
import Footer from '../components/Layout/Footer.jsx'
import CategoryTabs from '../components/CategoryTabs.jsx'
import NavGroup from '../components/NavCard/NavGroup.jsx'
import EmptyTip from '../components/EmptyTip.jsx'
import { FAVORITES_CATEGORY, useFilterNav } from '../hooks/useFilterNav.js'
import { useFavorites } from '../hooks/useFavorites.js'
import { getCategoryList } from '../data/navSources.js'

export default function HomePage() {
  const {
    searchText,
    setSearchText,
    activeCategoryKey,
    setActiveCategoryKey,
    filteredNavList,
  } = useFilterNav()
  const favorites = useFavorites()

  // 标签顺序：全部 / 我的收藏 / 各真实分类
  const categoryTabs = useMemo(() => {
    const [allTab, ...restTabs] = getCategoryList()
    return [
      allTab,
      { key: FAVORITES_CATEGORY, label: '我的收藏', icon: 'heart' },
      ...restTabs,
    ]
  }, [])

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
          <div className="space-y-9">
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
