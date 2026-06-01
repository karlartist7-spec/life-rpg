'use client'

/**
 * /dashboard/pets — 宠物图鉴 + 出战管理
 *
 * 上：状态条（active 名额 / 稀有度分布）
 * 中：filter 标签（全部 / common / rare / epic / legendary / 已出战）
 * 下：宠物卡片 grid（点击打开详情 modal）
 */
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  X,
  ChevronRight,
  Swords,
  Shield,
  Heart,
  PawPrint,
} from 'lucide-react'
import { PetCard, type PetCardData } from '@/components/pet-card'
import { RarityBadge, rarityLabel, type Rarity } from '@/components/rarity-badge'
import { LoadingState } from '@/components/doodle-kit'
import { evolutionRequirement } from '@/lib/progression.mjs'

type Pet = PetCardData & {
  user_id: string
  description: string | null
  base_image_url: string | null
  evolution_history: Array<{ stage: number; image_url: string; evolved_at: string }>
  habitat_origin: string | null
  caught_at: string
  caught_adventure_id: string | null
  exp: number
  stats: Record<string, number>
  pending_render: string | null
}

type Filter = 'all' | Rarity | 'active'

const FILTER_LABELS: Record<Filter, string> = {
  all: '全部',
  common: '常见',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
  active: '已出战',
}

const MAX_ACTIVE = 3

export default function PetsPage() {
  const [pets, setPets] = useState<Pet[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = async () => {
    const r = await fetch('/api/pets', { cache: 'no-store' })
    if (r.ok) {
      const j = await r.json()
      setPets(j.pets ?? [])
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  const counts = useMemo(() => {
    const c = { common: 0, rare: 0, epic: 0, legendary: 0, active: 0 }
    pets.forEach((p) => {
      c[p.rarity] += 1
      if (p.is_active) c.active += 1
    })
    return c
  }, [pets])

  const filtered = useMemo(() => {
    if (filter === 'all') return pets
    if (filter === 'active') return pets.filter((p) => p.is_active)
    return pets.filter((p) => p.rarity === filter)
  }, [pets, filter])

  const openPet = openId ? pets.find((p) => p.id === openId) ?? null : null

  const toggleActive = async (pet: Pet) => {
    setBusyId(pet.id)
    try {
      const r = await fetch('/api/pets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_pet_id: pet.id, active: !pet.is_active }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        if (j.error === 'PET_SLOT_FULL') {
          alert(`出战名额已满（最多 ${MAX_ACTIVE} 只），先收回一只再上场`)
        } else {
          alert(`操作失败: ${j.error || r.status}`)
        }
        return
      }
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  const evolvePet = async (pet: Pet) => {
    setBusyId(pet.id)
    try {
      const r = await fetch('/api/pets/evolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_pet_id: pet.id }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        const msg: Record<string, string> = {
          LEVEL_TOO_LOW: `等级不够：需 Lv.${j.need?.level}`,
          MISSING_ITEM: `缺少道具：需要 ${j.need?.item}`,
          MAX_STAGE: '已是最终形态',
          ALREADY_PENDING: '进化已在队列中',
        }
        alert(msg[j.error] || `进化失败：${j.error || r.status}`)
        return
      }
      alert('进化已开始，稍后立绘会更新')
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return <LoadingState icon={PawPrint} label="加载宠物中…" />
  }

  return (
    <div className="space-y-6">
      {/* 头条：标题 + 出战名额 + 稀有度分布 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-doodle"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-ink">
              <PawPrint className="h-8 w-8" strokeWidth={2.5} />
              宠物图鉴
            </h1>
            <p className="mt-1 text-sm text-mute">
              冒险中遇到的伙伴。出战中的宠物会一起打怪、出现在冒险立绘里。
            </p>
          </div>

          {/* 出战名额 */}
          <div className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-doodle-mint px-4 py-3 shadow-doodle-sm">
            <div className="flex gap-1.5">
              {Array.from({ length: MAX_ACTIVE }).map((_, i) => (
                <div
                  key={i}
                  className={`h-4 w-4 rounded-full border-2 border-ink ${
                    i < counts.active ? 'bg-ink' : 'bg-paper'
                  }`}
                />
              ))}
            </div>
            <span className="font-display text-sm font-bold text-ink">
              出战 {counts.active} / {MAX_ACTIVE}
            </span>
          </div>
        </div>

        {/* 稀有度分布条 */}
        <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
          {(['common', 'rare', 'epic', 'legendary'] as Rarity[]).map((r) => (
            <button
              key={r}
              onClick={() => setFilter(r)}
              className={`rarity-card rarity-card--${r} flex items-center justify-between px-3 py-2.5 ${
                filter === r ? 'translate-x-[-3px] translate-y-[-3px]' : ''
              }`}
            >
              <span className="font-display text-sm font-bold uppercase tracking-wide">
                {rarityLabel(r)}
              </span>
              <span className="font-display text-2xl font-bold">{counts[r]}</span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Filter 标签 */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => {
          const active = filter === f
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border-2 border-ink px-4 py-1.5 font-display text-sm font-bold transition-all ${
                active
                  ? 'bg-ink text-paper shadow-doodle-sm'
                  : 'bg-paper text-ink hover:bg-cream'
              }`}
            >
              {FILTER_LABELS[f]}
              {f !== 'all' && (
                <span className="ml-1.5 opacity-70">
                  ({f === 'active' ? counts.active : counts[f as Rarity]})
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="card-doodle py-16 text-center">
          <PawPrint className="mx-auto mb-3 h-16 w-16 text-mute" strokeWidth={1.5} />
          <p className="font-display text-lg text-ink-soft">
            {pets.length === 0 ? '还没有宠物' : '此分类下暂无宠物'}
          </p>
          <p className="mt-1 text-sm text-mute">
            {pets.length === 0
              ? '在冒险中可能会遇到野生宠物，触发捕获时就会出现在这里'
              : '换个分类看看？'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((pet, i) => (
            <motion.div
              key={pet.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.4) }}
            >
              <PetCard pet={pet} onClick={() => setOpenId(pet.id)} />
            </motion.div>
          ))}
        </div>
      )}

      {/* 详情 Modal */}
      <AnimatePresence>
        {openPet && (
          <PetDetailModal
            pet={openPet}
            onClose={() => setOpenId(null)}
            onToggleActive={() => toggleActive(openPet)}
            onEvolve={() => evolvePet(openPet)}
            busy={busyId === openPet.id}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/** 详情 Modal */
function PetDetailModal({
  pet,
  onClose,
  onToggleActive,
  onEvolve,
  busy,
}: {
  pet: Pet
  onClose: () => void
  onToggleActive: () => void
  onEvolve: () => void
  busy: boolean
}) {
  const display = pet.nickname || pet.name
  const stats = pet.stats || {}
  const evolutionPercent =
    pet.max_stage > 1 ? (pet.evolution_stage / pet.max_stage) * 100 : 100

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ type: 'spring', damping: 20 }}
        className={`rarity-card rarity-card--${pet.rarity} relative z-10 my-8 max-h-[90vh] w-full max-w-3xl overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-20 rounded-full border-2 border-ink bg-paper p-2 shadow-doodle-sm transition-transform hover:scale-110"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative z-10 grid gap-6 p-6 md:grid-cols-[1fr_1.2fr] md:p-8">
          {/* 左：立绘 */}
          <div>
            <div className="relative aspect-square overflow-hidden rounded-2xl border-2 border-ink bg-cream">
              {pet.current_image_url ? (
                <Image
                  src={pet.current_image_url}
                  alt={display}
                  fill
                  sizes="(max-width: 768px) 100vw, 40vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-mute">立绘生成中…</span>
                </div>
              )}
            </div>

            {/* 进化历史 */}
            {pet.evolution_history && pet.evolution_history.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 font-display text-xs font-bold uppercase text-ink-soft">
                  进化历程
                </p>
                <div className="flex gap-2 overflow-x-auto">
                  {pet.evolution_history.map((h, i) => (
                    <div
                      key={i}
                      className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 border-ink bg-cream"
                    >
                      <Image
                        src={h.image_url}
                        alt={`stage ${h.stage}`}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                      <span className="absolute bottom-0 left-0 right-0 bg-ink/80 text-center font-display text-[10px] font-bold text-paper">
                        {h.stage}阶
                      </span>
                    </div>
                  ))}
                  <ChevronRight className="my-auto h-5 w-5 text-mute" />
                  <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 border-doodle-coral bg-cream shadow-doodle-sm">
                    {pet.current_image_url && (
                      <Image
                        src={pet.current_image_url}
                        alt="current"
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    )}
                    <span className="absolute bottom-0 left-0 right-0 bg-doodle-coral text-center font-display text-[10px] font-bold text-ink">
                      现在
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 右：信息 */}
          <div className="space-y-4">
            {/* 标题 */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <RarityBadge rarity={pet.rarity} size="md" />
                {pet.element && (
                  <span className="rounded-full border-2 border-ink bg-paper px-2.5 py-0.5 font-display text-xs font-bold uppercase">
                    {pet.element}
                  </span>
                )}
              </div>
              <h2 className="font-display text-3xl font-bold text-ink">{display}</h2>
              {pet.nickname && pet.nickname !== pet.name && (
                <p className="text-sm text-mute">原名：{pet.name}</p>
              )}
            </div>

            {/* 描述 */}
            {pet.description && (
              <div className="rounded-xl border-2 border-ink bg-paper p-3">
                <p className="text-sm italic text-ink-soft">{pet.description}</p>
              </div>
            )}

            {/* 等级 + 进化 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border-2 border-ink bg-paper p-3">
                <p className="font-display text-xs font-bold uppercase text-mute">
                  等级
                </p>
                <p className="font-display text-2xl font-bold text-ink">
                  Lv.{pet.level}
                </p>
                <p className="text-xs text-mute">EXP {pet.exp}</p>
              </div>
              <div className="rounded-xl border-2 border-ink bg-paper p-3">
                <p className="font-display text-xs font-bold uppercase text-mute">
                  进化阶段
                </p>
                <p className="font-display text-2xl font-bold text-ink">
                  {pet.evolution_stage} / {pet.max_stage}
                </p>
                <div className="stat-bar mt-1.5 h-2">
                  <div
                    className="stat-bar__fill bg-doodle-coral"
                    style={{ width: `${evolutionPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 属性 */}
            <div>
              <p className="mb-2 font-display text-xs font-bold uppercase text-ink-soft">
                属性
              </p>
              <div className="grid grid-cols-3 gap-2">
                <StatBox icon={Heart} label="HP" value={stats.hp} color="bg-doodle-coral" />
                <StatBox icon={Swords} label="ATK" value={stats.atk} color="bg-doodle-sunshine" />
                <StatBox icon={Shield} label="DEF" value={stats.def} color="bg-doodle-sky" />
              </div>
            </div>

            {/* 元数据 */}
            {pet.habitat_origin && (
              <div className="text-xs text-mute">
                <span className="font-bold">出没于：</span>
                {pet.habitat_origin}
              </div>
            )}
            <div className="text-xs text-mute">
              <span className="font-bold">捕获于：</span>
              {new Date(pet.caught_at).toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </div>

            {/* 进化按钮 */}
            {pet.evolution_stage < pet.max_stage && (() => {
              const req = evolutionRequirement(pet.evolution_stage + 1)
              const pending = pet.pending_render === 'evolution'
              return (
                <button
                  onClick={onEvolve}
                  disabled={busy || pending}
                  className={`btn-doodle btn-doodle--sunshine w-full ${busy || pending ? 'cursor-wait opacity-60' : ''}`}
                >
                  <Sparkles className="h-4 w-4" />
                  {pending
                    ? '进化中…'
                    : req
                      ? `进化到 ${pet.evolution_stage + 1} 阶（需 Lv.${req.level} + ${req.item}）`
                      : '进化'}
                </button>
              )
            })()}

            {/* 出战按钮 */}
            <button
              onClick={onToggleActive}
              disabled={busy}
              className={`btn-doodle w-full ${
                pet.is_active ? 'btn-doodle--peri' : 'btn-doodle--mint'
              } ${busy ? 'cursor-wait opacity-60' : ''}`}
            >
              <Sparkles className="h-4 w-4" />
              {busy ? '处理中…' : pet.is_active ? '收回宠物' : '派出战'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function StatBox({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
  value: number | undefined
  color: string
}) {
  return (
    <div className="rounded-xl border-2 border-ink bg-paper p-2.5 text-center">
      <div
        className={`mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink ${color}`}
      >
        <Icon className="h-4 w-4" strokeWidth={2.5} />
      </div>
      <p className="font-display text-[10px] font-bold uppercase text-mute">{label}</p>
      <p className="font-display text-lg font-bold text-ink">{value ?? '—'}</p>
    </div>
  )
}
