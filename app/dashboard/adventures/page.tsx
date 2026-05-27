'use client'

/**
 * /dashboard/adventures — 冒险日志全列表 + 详情
 *
 * - 头条：本月冒险次数 / 总 EXP / 捕获宠物 / 总掉落
 * - 筛选：全部 / 有遭遇 / 已捕获 / 按场景类型
 * - 卡片 grid：场景立绘 + 故事预览 + 遭遇/奖励徽章
 * - 点击 → modal：完整故事 + 大图 + 捕获详情 + 全部掉落
 * - 支持 ?id=xxx 直接打开某条
 */
import { useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  X,
  Compass,
  Trophy,
  PawPrint,
  Package,
  Clock,
  Filter as FilterIcon,
} from 'lucide-react'
import { RarityBadge, type Rarity } from '@/components/rarity-badge'

type Adventure = {
  id: string
  started_at: string
  completed_at: string | null
  scene_type: string
  story_md: string
  scene_image_url: string | null
  pets_dispatched: any[]
  rewards: { exp?: number; items?: Array<{ item_slug: string; qty: number }> } | null
  pet_encounter: {
    name: string
    rarity: Rarity
    caught: boolean
    element?: string
    description?: string
    base_prompt?: string
    image_url?: string
  } | null
  status: string
}

type Filter = 'all' | 'encounter' | 'caught' | string // string for scene_type

const SCENE_LABELS: Record<string, string> = {
  forest: '森林',
  ocean: '海洋',
  town: '城镇',
  underground: '地下',
  mountain: '山脉',
  ruin: '遗迹',
  otherworld: '异界',
  desert: '沙漠',
  sky: '天空',
}

const SCENE_COLORS: Record<string, string> = {
  forest: 'bg-doodle-mint',
  ocean: 'bg-doodle-sky',
  town: 'bg-doodle-sunshine',
  underground: 'bg-doodle-lilac text-paper',
  mountain: 'bg-cream',
  ruin: 'bg-doodle-coral text-paper',
  otherworld: 'bg-doodle-periwinkle text-paper',
  desert: 'bg-doodle-sunshine',
  sky: 'bg-doodle-sky',
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '进行中'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} 分钟`
  return `${Math.floor(min / 60)} 时 ${min % 60} 分`
}

function AdventuresInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialId = searchParams.get('id')

  const [advs, setAdvs] = useState<Adventure[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(initialId)

  useEffect(() => {
    fetch('/api/adventures', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setAdvs(j.adventures ?? []))
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const monthAgo = Date.now() - 30 * 86400_000
    const recent = advs.filter((a) => new Date(a.started_at).getTime() > monthAgo)
    let totalExp = 0
    let caught = 0
    let drops = 0
    for (const a of advs) {
      totalExp += a.rewards?.exp ?? 0
      drops += a.rewards?.items?.length ?? 0
      if (a.pet_encounter?.caught) caught += 1
    }
    return { count: recent.length, totalCount: advs.length, totalExp, caught, drops }
  }, [advs])

  const sceneTypes = useMemo(() => {
    const set = new Set<string>()
    advs.forEach((a) => set.add(a.scene_type))
    return Array.from(set)
  }, [advs])

  const filtered = useMemo(() => {
    if (filter === 'all') return advs
    if (filter === 'encounter') return advs.filter((a) => a.pet_encounter)
    if (filter === 'caught') return advs.filter((a) => a.pet_encounter?.caught)
    return advs.filter((a) => a.scene_type === filter)
  }, [advs, filter])

  const open = openId ? advs.find((a) => a.id === openId) ?? null : null

  const closeModal = () => {
    setOpenId(null)
    if (initialId) router.replace('/dashboard/adventures')
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Compass className="mx-auto mb-4 h-12 w-12 animate-spin text-doodle-periwinkle" />
          <p className="font-display text-lg text-mute">加载冒险日志…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 头条：统计四宫格 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-doodle"
      >
        <div className="mb-4 flex items-center gap-3">
          <Compass className="h-7 w-7 text-doodle-periwinkle" strokeWidth={2.5} />
          <h1 className="font-display text-2xl font-bold">冒险日志</h1>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border-2 border-ink bg-doodle-periwinkle p-4 text-paper shadow-[4px_4px_0_0_#1a1a1a]">
            <div className="font-display text-3xl font-bold">{stats.count}</div>
            <div className="text-xs">近 30 天</div>
          </div>
          <div className="rounded-xl border-2 border-ink bg-doodle-mint p-4 shadow-[4px_4px_0_0_#1a1a1a]">
            <div className="font-display text-3xl font-bold">+{stats.totalExp}</div>
            <div className="text-xs">总 EXP</div>
          </div>
          <div className="rounded-xl border-2 border-ink bg-doodle-pink p-4 shadow-[4px_4px_0_0_#1a1a1a]">
            <div className="font-display text-3xl font-bold">{stats.caught}</div>
            <div className="text-xs">捕获宠物</div>
          </div>
          <div className="rounded-xl border-2 border-ink bg-doodle-sunshine p-4 shadow-[4px_4px_0_0_#1a1a1a]">
            <div className="font-display text-3xl font-bold">{stats.drops}</div>
            <div className="text-xs">物品掉落</div>
          </div>
        </div>
      </motion.div>

      {/* 筛选 */}
      <div className="card-doodle">
        <div className="mb-3 flex items-center gap-2">
          <FilterIcon className="h-4 w-4 text-mute" />
          <span className="font-display text-sm font-bold text-mute">筛选</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'encounter', 'caught'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg border-2 border-ink px-3 py-1.5 font-display text-sm font-bold transition-all ${
                filter === f
                  ? 'bg-doodle-periwinkle text-paper shadow-[2px_2px_0_0_#1a1a1a]'
                  : 'bg-paper text-ink hover:bg-cream'
              }`}
            >
              {f === 'all' ? `全部 ${advs.length}` : f === 'encounter' ? '有遭遇' : '已捕获'}
            </button>
          ))}
          {sceneTypes.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-lg border-2 border-ink px-3 py-1.5 font-display text-sm font-bold transition-all ${
                filter === s
                  ? `${SCENE_COLORS[s] || 'bg-doodle-periwinkle text-paper'} shadow-[2px_2px_0_0_#1a1a1a]`
                  : 'bg-paper text-ink hover:bg-cream'
              }`}
            >
              {SCENE_LABELS[s] || s}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      {filtered.length === 0 ? (
        <div className="card-doodle text-center">
          <Compass className="mx-auto mb-3 h-12 w-12 text-mute" />
          <p className="font-display text-lg text-mute">这里还没有冒险记录</p>
          <p className="mt-2 text-sm text-mute">
            WHOOP 同步或运动结束后会自动触发冒险，每次约 5-15 分钟
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((adv, i) => {
            const story = (adv.story_md || '').replace(/\n+/g, ' ').slice(0, 140)
            const expGain = adv.rewards?.exp ?? 0
            const itemCount = adv.rewards?.items?.length ?? 0
            return (
              <motion.button
                key={adv.id}
                onClick={() => setOpenId(adv.id)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="card-doodle group flex flex-col gap-3 p-0 overflow-hidden text-left transition-all hover:translate-x-[-3px] hover:translate-y-[-3px] hover:shadow-[6px_6px_0_0_#1a1a1a]"
              >
                {/* 立绘 */}
                <div className="relative aspect-[16/10] w-full overflow-hidden border-b-2 border-ink bg-cream">
                  {adv.scene_image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={adv.scene_image_url}
                      alt={adv.scene_type}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Sparkles className="h-10 w-10 animate-pulse text-mute" />
                      <span className="ml-2 font-display text-sm text-mute">立绘生成中…</span>
                    </div>
                  )}
                  {/* 场景标签（左上） */}
                  <span className={`absolute left-2 top-2 rounded-md border-2 border-ink px-2 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider ${SCENE_COLORS[adv.scene_type] || 'bg-paper'}`}>
                    {SCENE_LABELS[adv.scene_type] || adv.scene_type}
                  </span>
                  {/* 遭遇徽章（右上） */}
                  {adv.pet_encounter && (
                    <div className="absolute right-2 top-2">
                      <RarityBadge rarity={adv.pet_encounter.rarity} size="sm" />
                    </div>
                  )}
                </div>

                {/* 内容 */}
                <div className="flex-1 space-y-2 px-4 pb-4">
                  {adv.pet_encounter && (
                    <div className="flex items-center gap-2 rounded-lg border-2 border-ink bg-paper px-2 py-1">
                      <PawPrint className="h-4 w-4 flex-shrink-0 text-doodle-pink" strokeWidth={2.5} />
                      <span className="font-display text-sm font-bold text-ink">
                        {adv.pet_encounter.caught ? '捕获' : '遭遇'} · {adv.pet_encounter.name}
                      </span>
                    </div>
                  )}
                  <p className="line-clamp-3 text-sm leading-relaxed text-ink-soft">{story}…</p>
                  <div className="flex items-center justify-between border-t-2 border-dashed border-ink/20 pt-2">
                    <div className="flex items-center gap-2">
                      {expGain > 0 && (
                        <span className="flex items-center gap-1 font-display text-xs font-bold text-doodle-mint">
                          <Trophy className="h-3 w-3" strokeWidth={2.5} />+{expGain}
                        </span>
                      )}
                      {itemCount > 0 && (
                        <span className="flex items-center gap-1 font-display text-xs font-bold text-doodle-coral">
                          <Package className="h-3 w-3" strokeWidth={2.5} />×{itemCount}
                        </span>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-xs text-mute">
                      <Clock className="h-3 w-3" />
                      {new Date(adv.started_at).toLocaleString('zh-CN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </motion.button>
            )
          })}
        </div>
      )}

      {/* 详情 Modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/60 p-4 backdrop-blur-sm md:items-center"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-3xl rounded-2xl border-2 border-ink bg-paper shadow-[8px_8px_0_0_#1a1a1a]"
            >
              {/* 关闭 */}
              <button
                onClick={closeModal}
                className="absolute right-3 top-3 z-10 rounded-full border-2 border-ink bg-paper p-2 transition-all hover:bg-cream"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>

              {/* 大图 */}
              {open.scene_image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={open.scene_image_url}
                  alt={open.scene_type}
                  className="h-72 w-full rounded-t-2xl border-b-2 border-ink object-cover md:h-96"
                />
              ) : (
                <div className="flex h-72 w-full items-center justify-center rounded-t-2xl border-b-2 border-ink bg-cream md:h-96">
                  <Sparkles className="h-12 w-12 animate-pulse text-mute" />
                </div>
              )}

              <div className="space-y-4 p-6">
                {/* 头部 */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md border-2 border-ink px-3 py-1 font-display text-xs font-bold uppercase tracking-wider ${SCENE_COLORS[open.scene_type] || 'bg-paper'}`}>
                    {SCENE_LABELS[open.scene_type] || open.scene_type}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-mute">
                    <Clock className="h-3 w-3" />
                    {new Date(open.started_at).toLocaleString('zh-CN')}
                  </span>
                  <span className="text-xs text-mute">· {formatDuration(open.started_at, open.completed_at)}</span>
                  {open.status === 'rendering' && (
                    <span className="rounded-md border-2 border-ink bg-doodle-sunshine px-2 py-0.5 font-display text-[10px] font-bold">
                      立绘生成中
                    </span>
                  )}
                </div>

                {/* 故事 */}
                <div className="prose prose-sm max-w-none rounded-xl border-2 border-ink bg-cream p-4 leading-relaxed text-ink-soft">
                  {open.story_md.split(/\n+/).map((p, i) => (
                    <p key={i} className="mb-2 last:mb-0">{p}</p>
                  ))}
                </div>

                {/* 宠物遭遇 */}
                {open.pet_encounter && (
                  <div className={`rounded-xl border-2 border-ink p-4 rarity-card--${open.pet_encounter.rarity}`}>
                    <div className="mb-3 flex items-center gap-3">
                      <PawPrint className="h-6 w-6 text-doodle-pink" strokeWidth={2.5} />
                      <div className="flex-1">
                        <div className="font-display text-lg font-bold">
                          {open.pet_encounter.caught ? '✓ 捕获了' : '⚡ 遭遇了'} {open.pet_encounter.name}
                        </div>
                        {open.pet_encounter.element && (
                          <div className="text-xs text-mute">元素：{open.pet_encounter.element}</div>
                        )}
                      </div>
                      <RarityBadge rarity={open.pet_encounter.rarity} size="md" />
                    </div>
                    {open.pet_encounter.description && (
                      <p className="text-sm leading-relaxed text-ink-soft">{open.pet_encounter.description}</p>
                    )}
                  </div>
                )}

                {/* 奖励 */}
                {open.rewards && (
                  <div className="rounded-xl border-2 border-ink bg-paper p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-doodle-sunshine" strokeWidth={2.5} />
                      <span className="font-display text-base font-bold">奖励</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(open.rewards.exp ?? 0) > 0 && (
                        <span className="rounded-lg border-2 border-ink bg-doodle-mint px-3 py-1.5 font-display text-sm font-bold">
                          +{open.rewards.exp} EXP
                        </span>
                      )}
                      {(open.rewards.items ?? []).map((it, i) => (
                        <span
                          key={i}
                          className="rounded-lg border-2 border-ink bg-cream px-3 py-1.5 font-display text-sm font-bold"
                        >
                          {it.item_slug} ×{it.qty}
                        </span>
                      ))}
                      {(open.rewards.exp ?? 0) === 0 && (open.rewards.items?.length ?? 0) === 0 && (
                        <span className="text-sm text-mute">这次空手而归</span>
                      )}
                    </div>
                  </div>
                )}

                {/* 出战宠物 */}
                {open.pets_dispatched && open.pets_dispatched.length > 0 && (
                  <div className="rounded-xl border-2 border-ink bg-paper p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <PawPrint className="h-5 w-5 text-doodle-periwinkle" strokeWidth={2.5} />
                      <span className="font-display text-base font-bold">出战宠物</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {open.pets_dispatched.map((p: any, i: number) => (
                        <span
                          key={i}
                          className="rounded-lg border-2 border-ink bg-cream px-3 py-1.5 font-display text-sm font-bold"
                        >
                          {p.name || p.nickname || '未知'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function AdventuresPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[60vh] items-center justify-center">
        <Compass className="h-12 w-12 animate-spin text-doodle-periwinkle" />
      </div>
    }>
      <AdventuresInner />
    </Suspense>
  )
}
