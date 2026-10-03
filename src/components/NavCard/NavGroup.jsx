import LazyCard from '../LazyCard.jsx'
import NavCard from './NavCard.jsx'

export default function NavGroup({ groupTitle, itemList }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="h-6 w-1.5 rounded-full bg-gradient-to-b from-food-primary to-[#FFA6C6]"
        />
        <span className="font-display text-section-title text-food-dark">
          {groupTitle}
        </span>
        <span aria-hidden="true" className="text-sm text-food-sun">
          ✦
        </span>
        <span
          aria-hidden="true"
          className="h-0 flex-1 border-b-2 border-dashed border-food-accent-soft"
        />
      </h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-3 lg:grid-cols-4">
        {itemList.map((item) => (
          <LazyCard key={item.name}>
            <NavCard {...item} />
          </LazyCard>
        ))}
      </div>
    </section>
  )
}
