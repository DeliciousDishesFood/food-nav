/** admin 懒加载 chunk 的 Suspense fallback：贴纸风加载卡片 */
export default function AdminFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="rounded-3xl border-2 border-food-line bg-food-surface px-8 py-6 font-rounded text-control text-food-muted shadow-foodSticker">
        <span aria-hidden="true" className="mr-2 text-food-sun">
          ✦
        </span>
        管理台加载中…
      </div>
    </div>
  )
}
