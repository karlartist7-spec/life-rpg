import { ShoppingBag } from 'lucide-react'

export default function ShopPage() {
  return (
    <div className="card-doodle text-center">
      <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full border-2 border-ink bg-doodle-pink">
        <ShoppingBag className="h-12 w-12 text-ink" strokeWidth={2.5} />
      </div>
      <h1 className="font-display text-2xl font-bold">商店</h1>
      <p className="mt-2 text-mute">用 EXP 兑换 buff / 装备 / 称号</p>
      <p className="mt-4 inline-block rounded-lg border-2 border-ink bg-doodle-sunshine px-4 py-2 font-display text-sm font-bold">
        Coming Soon
      </p>
    </div>
  )
}
