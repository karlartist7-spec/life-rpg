'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Sparkles, Lock, Unlock, ArrowLeft, Compass, Heart, Zap, Clock } from 'lucide-react'

interface Chapter {
  idx: number
  title: string
  body: string
  unlock_offset_min: number
}

interface Adventure {
  id: string
  user_id: string
  started_at: string
  completed_at: string | null
  scene_type: string
  scene_tier: 'nearby' | 'coast' | 'ruin' | 'astral'
  rarity_tier: 'common' | 'rare' | 'epic' | 'legendary'
  stamina_used: number
  duration_min: number
  chapters: Chapter[]
  triggered_by: string
  story_md: string
  scene_image_url: string | null
  pets_dispatched: any[]
  rewards: { exp?: number; items?: Array<{ item_slug: string; qty: number; rarity?: string }> } | null
  pet_encounter: { name: string; rarity: string; caught: boolean; element?: string; image_url?: string } | null
  status: string
}

const TIER_BADGE: Record<string, { bg: string; label: string }> = {
  nearby: { bg: 'bg-doodle-mint text-ink', label: '近郊' },
  coast: { bg: 'bg-doodle-sky text-ink', label: '海岸' },
  ruin: { bg: 'bg-doodle-lilac text-paper', label: '遗迹' },
  astral: { bg: 'bg-doodle-sunshine text-ink', label: '异界' },
}

const RARITY_BADGE: Record<string, string> = {
  common: 'bg-cream text-ink',
  rare: 'bg-doodle-sky text-ink',
  epic: 'bg-doodle-lilac text-paper',
  legendary: 'bg-doodle-sunshine text-ink',
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '已解锁'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function AdventureDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [adv, setAdv] = useState<Adventure | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!id) return
    fetch(`/api/adventures?id=${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => setAdv(data.adventure ?? data))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const startedAtMs = adv ? new Date(adv.started_at).getTime() : 0
  const elapsedMin = useMemo(() => (startedAtMs ? Math.floor((now - startedAtMs) / 60000) : 0), [now, startedAtMs])
  const totalDuration = adv?.duration_min ?? 0
  const progressPct = totalDuration > 0 ? Math.min(100, (elapsedMin / totalDuration) * 100) : 0

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Sparkles className="h-12 w-12 animate-spin text-doodle-periwinkle" />
      </div>
    )
  }

  if (err || !adv) {
    return (
      <div className="card-doodle text-center">
        <p className="text-doodle-coral">加载冒险失败：{err ?? '未找到'}</p>
        <Link href="/dashboard/adventures" className="mt-3 inline-block font-display text-sm font-bold text-doodle-periwinkle hover:underline">
          ← 返回冒险列表
        </Link>
      </div>
    )
  }

  // 兜底：旧记录没 chapters，把 story_md 当一章展示
  const chapters: Chapter[] =
    Array.isArray(adv.chapters) && adv.chapters.length > 0
      ? adv.chapters
      : [{ idx: 1, title: '冒险记录', body: adv.story_md ?? '', unlock_offset_min: 0 }]

  const tier = TIER_BADGE[adv.scene_tier] ?? TIER_BADGE.nearby

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/adventures"
        className="inline-flex items-center gap-1 font-display text-sm font-bold text-mute hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> 返回冒险列表
      </Link>

      {/* 头图 + 元信息 */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card-doodle overflow-hidden p-0">
        {adv.scene_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={adv.scene_image_url} alt={adv.scene_type} className="h-64 w-full border-b-2 border-ink object-cover" />
        ) : (
          <div className="flex h-64 items-center justify-center border-b-2 border-ink bg-cream">
            <Sparkles className="h-12 w-12 animate-pulse text-mute" />
          </div>
        )}
        <div className="p-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-md border-2 border-ink px-2 py-0.5 font-display text-xs font-bold ${tier.bg}`}>
              <Compass className="mr-1 inline h-3 w-3" strokeWidth={2.5} />
              {tier.label}
            </span>
            <span className={`rounded-md border-2 border-ink px-2 py-0.5 font-display text-xs font-bold ${RARITY_BADGE[adv.rarity_tier] ?? RARITY_BADGE.common}`}>
              {(adv.rarity_tier ?? 'common').toUpperCase()}
            </span>
            <span className="rounded-md border-2 border-ink bg-paper px-2 py-0.5 font-display text-xs text-mute">
              <Zap className="mr-1 inline h-3 w-3 text-doodle-sunshine" strokeWidth={2.5} />
              体力 {adv.stamina_used ?? 0}
            </span>
            <span className="rounded-md border-2 border-ink bg-paper px-2 py-0.5 font-display text-xs text-mute">
              <Clock className="mr-1 inline h-3 w-3" strokeWidth={2.5} />
              共 {Math.round((adv.duration_min ?? 0) / 60 * 10) / 10}h · {chapters.length} 章
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">{adv.scene_type}</h1>
          <p className="mt-1 text-sm text-mute">
            开始：{new Date(adv.started_at).toLocaleString('zh-CN')}
            {adv.triggered_by && <span className="ml-2">· 触发 {adv.triggered_by}</span>}
          </p>

          {/* 总进度条 */}
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-mute">
              <span>章节进度</span>
              <span>{elapsedMin} / {totalDuration} 分钟</span>
            </div>
            <div className="stat-bar">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 1 }}
                className="stat-bar__fill bg-doodle-periwinkle"
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* 章节列表 */}
      <div className="space-y-4">
        {chapters.map((ch, i) => {
          const unlockAt = startedAtMs + ch.unlock_offset_min * 60_000
          const remainMs = unlockAt - now
          const unlocked = remainMs <= 0
          return (
            <motion.div
              key={ch.idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`card-doodle ${unlocked ? '' : 'bg-cream'}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {unlocked ? (
                    <Unlock className="h-5 w-5 text-doodle-mint" strokeWidth={2.5} />
                  ) : (
                    <Lock className="h-5 w-5 text-mute" strokeWidth={2.5} />
                  )}
                  <h2 className="font-display text-lg font-bold">
                    第 {ch.idx} 章 · {unlocked ? ch.title : '???'}
                  </h2>
                </div>
                <span className={`rounded-md border-2 border-ink px-2 py-0.5 font-display text-xs font-bold ${unlocked ? 'bg-doodle-mint text-ink' : 'bg-paper text-mute'}`}>
                  {unlocked ? '已解锁' : fmtCountdown(remainMs)}
                </span>
              </div>
              {unlocked ? (
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-ink-soft">{ch.body}</div>
              ) : (
                <p className="text-sm italic text-mute">
                  此章节将在冒险开始 {ch.unlock_offset_min} 分钟后解锁
                  {new Date(unlockAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 揭晓
                </p>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* 宠物遭遇 */}
      {adv.pet_encounter && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card-doodle"
        >
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <Heart className="h-5 w-5 fill-doodle-pink text-doodle-pink" strokeWidth={2.5} />
            宠物遭遇
          </h2>
          <div className="flex items-center gap-4">
            {adv.pet_encounter.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={adv.pet_encounter.image_url} alt={adv.pet_encounter.name} className="h-24 w-24 rounded-xl border-2 border-ink object-cover" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-xl border-2 border-dashed border-mute bg-cream">
                <Sparkles className="h-6 w-6 animate-pulse text-mute" />
              </div>
            )}
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-display text-lg font-bold">{adv.pet_encounter.name}</span>
                <span className={`rounded-md border-2 border-ink px-2 py-0.5 font-display text-[10px] font-bold ${RARITY_BADGE[adv.pet_encounter.rarity] ?? RARITY_BADGE.common}`}>
                  {adv.pet_encounter.rarity.toUpperCase()}
                </span>
                {adv.pet_encounter.element && (
                  <span className="rounded-md border-2 border-ink bg-paper px-2 py-0.5 font-display text-[10px] font-bold">
                    {adv.pet_encounter.element}
                  </span>
                )}
              </div>
              <p className="text-sm text-ink-soft">
                {adv.pet_encounter.caught ? '已捕获，加入宠物图鉴' : '擦肩而过，未能捕获'}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* 奖励 */}
      {adv.rewards && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="card-doodle"
        >
          <h2 className="mb-3 font-display text-lg font-bold">奖励</h2>
          <div className="flex flex-wrap items-center gap-3">
            {adv.rewards.exp && adv.rewards.exp > 0 && (
              <span className="rounded-md border-2 border-ink bg-doodle-mint px-3 py-1 font-display text-sm font-bold text-ink">
                +{adv.rewards.exp} EXP
              </span>
            )}
            {adv.rewards.items?.map((it, i) => (
              <span key={i} className={`rounded-md border-2 border-ink px-3 py-1 font-display text-sm font-bold ${RARITY_BADGE[it.rarity ?? 'common']}`}>
                {it.item_slug} ×{it.qty}
              </span>
            ))}
            {!adv.rewards.exp && !adv.rewards.items?.length && (
              <span className="text-sm text-mute">本次冒险无奖励</span>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}
