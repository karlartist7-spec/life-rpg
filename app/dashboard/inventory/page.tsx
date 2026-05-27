'use client'

/**
 * /dashboard/inventory — 背包真页面
 * 上：统计四宫格（总数 / 装备 / 材料 / 消耗）
 * 中：类型筛选（全部 / 装备 / 消耗 / 材料 / 宠物蛋 / 收藏）
 * 下：物品卡片 grid（稀有度边框 + 数量徽章 + 来源 adventure 链接）
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Package,
  Sword,
  FlaskConical,
  Gem,
  Egg,
  Sparkles,
  Filter as FilterIcon,
} from 'lucide-react'
import { RarityBadge, type Rarity } from '@/components/rarity-badge'

type InvRow = {
  id: string
  item_slug: string
  qty: number
  equipped: boolean
  acquired_adventure_id: string | null
  acquired_at: string
  meta: {
    slug: string
    name: string
    description: string | null
    type: string // equip / consumable / material / egg / collect / unknown
    rarity: Rarity
    image_url: string | null
  }
}

type Filter = 'all' | 'equip' | 'consumable' | 'material' | 'egg' | 'collect'

const TYPE_LABELS: Record<Filter, string> = {
  all: '全部',
  equip: '装备',
  consumable: '消耗',
  material: '材料',
  egg: '宠物蛋',
  collect: '收藏',
}

const TYPE_ICONS = {
  equip: Sword,
  consumable: FlaskConical,
  material: Gem,
  egg: Egg,
  collect: Sparkles,
}

const TYPE_COLORS: Record<string, string> = {
  equip: 'bg-doodle-coral text-paper',
  consumable: 'bg-doodle-mint',
  material: 'bg-doodle-sky',
  egg: 'bg-doodle-pink',
  collect: 'bg-doodle-lilac text-paper',
}

const RARITY_BORDER: Record<Rarity, string> = {
  common: 'border-mute',
  rare: 'border-doodle-sky',
  epic: 'border-doodle-lilac',
  legendary: 'border-doodle-sunshine',
}

const RARITY_BG: Record<Rarity, string> = {
  common: 'bg-paper',
  rare: 'bg-doodle-sky/10',
  epic: 'bg-doodle-lilac/10',
  legendary: 'bg-doodle-sunshine/20',
}

export default function InventoryPage() {
  const [items, setItems] = useState<InvRow[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    fetch('/api/inventory', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        setItems(j.items ?? [])
        setStats(j.stats ?? null)
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((r) => r.meta.type === filter)
  }, [items, filter])

  // 按稀有度排序（legendary→epic→rare→common），同稀有度按获取时间
  const sorted = useMemo(() => {
    const order: Record<Rarity, number> = { legendary: 0, epic: 1, rare: 2, common: 3 }
    return [...filtered].sort((a, b) => {
      const ra = order[a.meta.rarity] ?? 99
      const rb = order[b.meta.rarity] ?? 99
      if (ra !== rb) return ra - rb
      return new Date(b.acquired_at).getTime() - new Date(a.acquired_at).getTime()
    })
  }, [filtered])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Package className="mx-auto mb-4 h-12 w-12 animate-pulse text-doodle-mint" />
          <p className="font-display text-lg text-mute">加载背包…</p>
        </div>
      </div>
    )
  }

  const typeCounts = stats?.by_type ?? {}

  return (
    <div className="space-y-6">
      {/* 头条 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-doodle"
      >
        <div className="mb-4 flex items-center gap-3">
          <Package className="h-7 w-7 text-doodle-mint" strokeWidth={2.5} />
          <h1 className="font-display text-2xl font-bold">背包</h1>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border-2 border-ink bg-doodle-mint p-4 shadow-[4px_4px_0_0_#1a1a1a]">
            <div className="font-display text-3xl font-bold">{stats?.total_qty ?? 0}</div>
            <div className="text-xs">物品总数</div>
          </div>
          <div className="rounded-xl border-2 border-ink bg-doodle-coral p-4 text-paper shadow-[4px_4px_0_0_#1a1a1a]">
            <div className="font-display text-3xl font-bold">{typeCounts.equip ?? 0}</div>
            <div className="text-xs">装备</div>
          </div>
          <div className="rounded-xl border-2 border-ink bg-doodle-sky p-4 shadow-[4px_4px_0_0_#1a1a1a]">
            <div className="font-display text-3xl font-bold">{typeCounts.material ?? 0}</div>
            <div className="text-xs">材料</div>
          </div>
          <div className="rounded-xl border-2 border-ink bg-doodle-pink p-4 shadow-[4px_4px_0_0_#1a1a1a]">
            <div className="font-display text-3xl font-bold">{typeCounts.egg ?? 0}</div>
            <div className="text-xs">宠物蛋</div>
          </div>
        </div>
        {/* 稀有度小条 */}
        {stats && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(['legendary', 'epic', 'rare', 'common'] as Rarity[]).map((r) => {
              const n = stats.by_rarity?.[r] ?? 0
              if (!n) return null
              return (
                <div key={r} className="flex items-center gap-1.5">
                  <RarityBadge rarity={r} size="sm" />
                  <span className="font-display text-sm font-bold">{n}</span>
                </div>
              )
            })}
          </div>
        )}
      </motion.div>

      {/* 筛选 */}
      <div className="card-doodle">
        <div className="mb-3 flex items-center gap-2">
          <FilterIcon className="h-4 w-4 text-mute" />
          <span className="font-display text-sm font-bold text-mute">类型</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TYPE_LABELS) as Filter[]).map((f) => {
            const Icon = f !== 'all' ? TYPE_ICONS[f as keyof typeof TYPE_ICONS] : null
            const count = f === 'all' ? items.length : items.filter((r) => r.meta.type === f).length
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex items-center gap-1.5 rounded-lg border-2 border-ink px-3 py-1.5 font-display text-sm font-bold transition-all ${
                  filter === f
                    ? `${f === 'all' ? 'bg-doodle-periwinkle text-paper' : TYPE_COLORS[f]} shadow-[2px_2px_0_0_#1a1a1a]`
                    : 'bg-paper text-ink hover:bg-cream'
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />}
                {TYPE_LABELS[f]}
                <span className="opacity-70">({count})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 物品 grid */}
      {sorted.length === 0 ? (
        <div className="card-doodle text-center">
          <Package className="mx-auto mb-3 h-12 w-12 text-mute" />
          <p className="font-display text-lg text-mute">
            {filter === 'all' ? '背包空空如也，去冒险吧' : '这一类还没有物品'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {sorted.map((row, i) => {
            const TypeIcon = TYPE_ICONS[row.meta.type as keyof typeof TYPE_ICONS] ?? Sparkles
            return (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
                className={`relative rounded-xl border-4 ${RARITY_BORDER[row.meta.rarity]} ${RARITY_BG[row.meta.rarity]} p-3 shadow-[3px_3px_0_0_#1a1a1a] transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[5px_5px_0_0_#1a1a1a]`}
              >
                {/* 数量徽章 */}
                {row.qty > 1 && (
                  <div className="absolute -right-2 -top-2 z-10 flex h-8 min-w-[2rem] items-center justify-center rounded-full border-2 border-ink bg-ink px-1.5 font-display text-sm font-bold text-paper shadow-[2px_2px_0_0_#1a1a1a]">
                    ×{row.qty}
                  </div>
                )}
                {/* 装备态标记 */}
                {row.equipped && (
                  <div className="absolute -left-2 -top-2 z-10 rounded-full border-2 border-ink bg-doodle-sunshine px-2 py-0.5 font-display text-[10px] font-bold shadow-[2px_2px_0_0_#1a1a1a]">
                    装备中
                  </div>
                )}

                {/* 物品图标区 */}
                <div className="mb-3 flex aspect-square w-full items-center justify-center rounded-lg border-2 border-ink bg-paper">
                  {row.meta.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={row.meta.image_url} alt={row.meta.name} className="h-full w-full rounded-md object-cover" />
                  ) : (
                    <TypeIcon className="h-12 w-12 text-ink" strokeWidth={2} />
                  )}
                </div>

                {/* 名字 */}
                <div className="mb-1 line-clamp-2 font-display text-sm font-bold text-ink">
                  {row.meta.name}
                </div>

                {/* 类型 + 稀有度 */}
                <div className="flex items-center justify-between gap-1">
                  <span className={`rounded border border-ink px-1.5 py-0.5 font-display text-[10px] font-bold ${TYPE_COLORS[row.meta.type] || 'bg-cream'}`}>
                    {TYPE_LABELS[row.meta.type as Filter] || row.meta.type}
                  </span>
                  <RarityBadge rarity={row.meta.rarity} size="sm" />
                </div>

                {/* 来源 */}
                {row.acquired_adventure_id && (
                  <Link
                    href={`/dashboard/adventures?id=${row.acquired_adventure_id}`}
                    className="mt-2 block text-center font-display text-[10px] font-bold text-doodle-periwinkle hover:underline"
                  >
                    冒险来源 →
                  </Link>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
