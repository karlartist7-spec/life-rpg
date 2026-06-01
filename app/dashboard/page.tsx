'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import CountUp from 'react-countup'
import { Sparkles, TrendingUp, TrendingDown, Minus, Trophy, Lock, Check, Heart, Zap, Compass, Loader2, AlertTriangle } from 'lucide-react'

interface DashboardData {
  user: { email: string; display_name: string | null; avatar_url: string | null }
  character: {
    name: string
    level: number
    exp: number
    total_exp: number
    next_level_exp: number
    exp_to_next: number
    title: string
    title_code: string
    motto: string | null
  }
  today_snapshot: {
    date: string
    recovery_score: number | null
    sleep_minutes: number | null
    sleep_performance: number | null
    strain: number | null
    streak: number
    yesterday: {
      recovery_score: number | null
      sleep_minutes: number | null
      strain: number | null
    }
  }
  attributes: {
    physique: { label: string; value: number; color: string; source: string }
    endurance: { label: string; value: number; color: string; source: string }
    focus: { label: string; value: number; color: string; source: string }
    hp_max: number
    hp_current: number
    last7: Array<{ date: string; recovery: number; sleep_min: number; sleep_perf: number; strain: number; hrv: number }>
  } | null
  today_stamina: {
    stamina: number
    scene_tier: 'nearby' | 'coast' | 'ruin' | 'astral'
    rarity_tier: 'common' | 'rare' | 'epic' | 'legendary'
    stats_date: string | null
    stamina_pct: number
    tier_label: string
  } | null
  quests: Array<{
    id: string
    slug: string
    title: string
    description: string
    reward_exp: number
    progress: {
      status: 'completed' | 'pending' | 'locked'
      current_value: number
      target_value: number
      completed_at: string | null
    }
  }>
  adventure_log: Array<{
    id: string
    started_at: string
    completed_at: string | null
    scene_type: string
    scene_tier?: 'nearby' | 'coast' | 'ruin' | 'astral'
    rarity_tier?: 'common' | 'rare' | 'epic' | 'legendary'
    stamina_used?: number
    duration_min?: number
    chapters?: Array<{ idx: number; title: string; body: string; unlock_offset_min: number }>
    triggered_by?: string
    story_md: string
    scene_image_url: string | null
    pets_dispatched: any[]
    rewards: { exp?: number; items?: Array<{ item_slug: string; qty: number }> } | null
    pet_encounter: { name: string; rarity: string; caught: boolean; element?: string } | null
    status: string
  }>
  achievements: Array<{
    id: string
    slug: string
    title: string
    description: string
    icon: string | null
    progress: {
      status: 'unlocked' | 'locked'
      progress_current: number
      progress_target: number
      unlocked_at: string | null
    }
  }>
  exp_trend: Array<{ date: string; exp: number; level: number }>
  connections: {
    whoop: { connected: boolean; last_sync: string | null; expired: boolean | null }
    github: { connected: boolean }
    telegram: { connected: boolean; chat_id: string | null }
  }
}

const TITLE_MAP: Record<string, string> = {
  rookie: '初出茅庐',
  iron_body: '铁骨之躯',
  long_runner: '不竭行者',
  mind_sage: '心如止水',
}

const ATTR_COLORS: Record<string, string> = {
  mint: 'bg-doodle-mint',
  sky: 'bg-doodle-sky',
  lavender: 'bg-doodle-lilac',
}

const TIER_BADGE: Record<string, string> = {
  nearby: 'bg-doodle-mint text-ink',
  coast: 'bg-doodle-sky text-ink',
  ruin: 'bg-doodle-lilac text-paper',
  astral: 'bg-doodle-sunshine text-ink',
}

const RARITY_BADGE: Record<string, string> = {
  common: 'bg-cream text-ink',
  rare: 'bg-doodle-sky text-ink',
  epic: 'bg-doodle-lilac text-paper',
  legendary: 'bg-doodle-sunshine text-ink',
}

function DeltaIcon({ delta }: { delta: number }) {
  if (delta > 0) return <TrendingUp className="h-4 w-4 text-doodle-mint" />
  if (delta < 0) return <TrendingDown className="h-4 w-4 text-doodle-coral" />
  return <Minus className="h-4 w-4 text-mute" />
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Sparkles className="mx-auto mb-4 h-12 w-12 animate-spin text-doodle-periwinkle" />
          <p className="font-display text-lg text-mute">Loading...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="card-doodle text-center">
        <p className="text-doodle-coral">Failed to load dashboard data</p>
      </div>
    )
  }

  const { character: c, today_snapshot: t, attributes: attrs, today_stamina: stam, quests, adventure_log, achievements } = data
  const expPercent = (c.exp / c.next_level_exp) * 100
  const hpPercent = attrs ? (attrs.hp_current / attrs.hp_max) * 100 : 0

  // 状态立绘选择逻辑（按 recovery 分档）
  const recoveryState =
    t.recovery_score == null ? 'mid' : t.recovery_score >= 67 ? 'high' : t.recovery_score >= 34 ? 'mid' : 'low'
  const avatarUrl = `https://qgowirdryppnbgnvuzpg.supabase.co/storage/v1/object/public/character-art/hermes/state-${recoveryState}.png`

  return (
    <div className="space-y-6">
      {/* 角色主卡 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-doodle flex flex-col gap-6 md:flex-row"
      >
        {/* 左：立绘 */}
        <div className="flex-shrink-0">
          <div className="relative h-48 w-48 overflow-hidden rounded-2xl border-2 border-ink bg-cream">
            <img src={avatarUrl} alt={c.name} className="h-full w-full object-cover" />
          </div>
        </div>

        {/* 右：信息 */}
        <div className="flex-1 space-y-3">
          <div>
            <h1 className="font-display text-3xl font-bold text-ink">{c.name}</h1>
            <p className="text-sm text-mute">{TITLE_MAP[c.title_code] ?? c.title}</p>
          </div>

          {/* HP 条 */}
          {attrs && (
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 font-display font-bold">
                  <Heart className="h-4 w-4 fill-doodle-coral text-doodle-coral" strokeWidth={2.5} />
                  HP
                </span>
                <span className="text-mute">
                  <CountUp end={attrs.hp_current} duration={1} /> / {attrs.hp_max}
                </span>
              </div>
              <div className="stat-bar">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${hpPercent}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="stat-bar__fill bg-doodle-coral"
                />
              </div>
            </div>
          )}

          {/* EXP 进度条 */}
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-display font-bold">Lv.{c.level}</span>
              <span className="text-mute">
                <CountUp end={c.exp} duration={1} /> / {c.next_level_exp} EXP
              </span>
            </div>
            <div className="stat-bar">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${expPercent}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="stat-bar__fill bg-doodle-periwinkle"
              />
            </div>
          </div>

          {/* Motto */}
          {c.motto && <p className="italic text-ink-soft">&ldquo;{c.motto}&rdquo;</p>}

          {/* 三维快览 */}
          {attrs && (
            <div className="flex gap-3">
              {[
                { key: 'physique', data: attrs.physique },
                { key: 'endurance', data: attrs.endurance },
                { key: 'focus', data: attrs.focus },
              ].map(({ key, data: a }) => (
                <div key={key} className="text-center" title={a.source}>
                  <div className={`mb-1 rounded-lg border-2 border-ink px-3 py-1 ${ATTR_COLORS[a.color]}`}>
                    <span className="font-display text-lg font-bold">{a.value}</span>
                  </div>
                  <span className="text-xs text-mute">{a.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* 今日体力 + 场景档位 卡 */}
      {stam && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card-doodle"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold">
              <Zap className="h-5 w-5 fill-doodle-sunshine text-ink" strokeWidth={2.5} />
              今日体力
            </h2>
            <div className="flex items-center gap-2">
              <span className={`rounded-md border-2 border-ink px-2 py-0.5 font-display text-xs font-bold ${TIER_BADGE[stam.scene_tier]}`}>
                <Compass className="mr-1 inline h-3 w-3" strokeWidth={2.5} />
                {stam.tier_label}
              </span>
              <span className={`rounded-md border-2 border-ink px-2 py-0.5 font-display text-xs font-bold ${RARITY_BADGE[stam.rarity_tier]}`}>
                {stam.rarity_tier.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-display text-4xl font-bold text-ink">
              <CountUp end={stam.stamina} duration={1.5} />
            </span>
            <span className="text-sm text-mute">睡多久 × (recovery × strain) = 体力</span>
          </div>
          <div className="stat-bar">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${stam.stamina_pct}%` }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              className="stat-bar__fill bg-doodle-sunshine"
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-mute">
            <span>近郊 0</span>
            <span>海岸 100</span>
            <span>遗迹 250</span>
            <span>异界 400+</span>
          </div>
        </motion.div>
      )}

      {/* 今日状态 4 卡 */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Recovery', value: t.recovery_score, unit: '%', prev: t.yesterday.recovery_score },
          {
            label: 'Sleep',
            value: t.sleep_minutes ? Math.round(t.sleep_minutes / 60) : null,
            unit: 'h',
            prev: t.yesterday.sleep_minutes ? Math.round(t.yesterday.sleep_minutes / 60) : null,
          },
          { label: 'Strain', value: t.strain, unit: '', prev: t.yesterday.strain },
          { label: 'Streak', value: t.streak, unit: 'd', prev: null },
        ].map((stat, i) => {
          const delta = stat.prev != null && stat.value != null ? stat.value - stat.prev : 0
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="card-doodle text-center"
            >
              <p className="mb-2 text-sm font-bold uppercase text-mute">{stat.label}</p>
              <div className="flex items-center justify-center gap-2">
                <span className="font-display text-3xl font-bold text-ink">
                  {stat.value != null ? <CountUp end={stat.value} duration={1.5} decimals={0} /> : '—'}
                </span>
                <span className="text-lg text-mute">{stat.unit}</span>
              </div>
              {stat.prev != null && (
                <div className="mt-1 flex items-center justify-center gap-1 text-xs text-mute">
                  <DeltaIcon delta={delta} />
                  <span>{delta > 0 ? '+' : ''}{delta.toFixed(0)}</span>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* 今日任务 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="card-doodle"
      >
        <h2 className="mb-4 font-display text-xl font-bold">今日任务</h2>
        <div className="space-y-2">
          {quests.map((q) => {
            const completed = q.progress.status === 'completed'
            const percent = Math.min((q.progress.current_value / q.progress.target_value) * 100, 100)
            return (
              <div key={q.id} className="rounded-lg border-2 border-ink bg-paper p-3">
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h3 className="font-display text-sm font-bold">{q.title}</h3>
                    <p className="text-xs text-mute">{q.description}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${
                      completed ? 'bg-doodle-mint text-ink' : 'bg-cream text-mute'
                    }`}
                  >
                    {completed ? <Check className="h-4 w-4" /> : `${q.progress.current_value}/${q.progress.target_value}`}
                  </span>
                </div>
                <div className="stat-bar h-2">
                  <div className="stat-bar__fill bg-doodle-periwinkle" style={{ width: `${percent}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* 冒险日志 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="card-doodle"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">冒险日志</h2>
          <Link href="/dashboard/adventures" className="font-display text-sm font-bold text-doodle-periwinkle hover:underline">
            查看全部 →
          </Link>
        </div>
        <div className="space-y-3">
          {adventure_log.slice(0, 5).map((adv) => {
            const story = (adv.story_md || '').replace(/\n+/g, ' ').slice(0, 100)
            const expGain = adv.rewards?.exp ?? 0
            const itemCount = adv.rewards?.items?.length ?? 0
            return (
              <Link
                key={adv.id}
                href={`/dashboard/adventures?id=${adv.id}`}
                className="group flex gap-3 rounded-xl border-2 border-ink bg-paper p-3 transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[4px_4px_0_0_#1a1a1a]"
              >
                {adv.scene_image_url ? (
                  <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border-2 border-ink bg-cream">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={adv.scene_image_url} alt={adv.scene_type} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-mute bg-cream">
                    <Sparkles className="h-6 w-6 animate-pulse text-mute" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border-2 border-ink bg-doodle-periwinkle px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-paper">
                      {adv.scene_type}
                    </span>
                    {adv.pet_encounter && (
                      <span className={`rounded-md border-2 border-ink px-2 py-0.5 font-display text-[10px] font-bold ${
                        adv.pet_encounter.rarity === 'legendary' ? 'bg-doodle-sunshine text-ink' :
                        adv.pet_encounter.rarity === 'epic' ? 'bg-doodle-lilac text-paper' :
                        adv.pet_encounter.rarity === 'rare' ? 'bg-doodle-sky text-ink' :
                        'bg-cream text-ink'
                      }`}>
                        {adv.pet_encounter.caught ? '捕获' : '遭遇'} · {adv.pet_encounter.name}
                      </span>
                    )}
                    {expGain > 0 && (
                      <span className="font-display text-xs font-bold text-doodle-mint">+{expGain} EXP</span>
                    )}
                    {itemCount > 0 && (
                      <span className="font-display text-xs font-bold text-doodle-coral">+{itemCount} 物品</span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
                    {story ? `${story}${story.length >= 100 ? '…' : ''}` : (
                      adv.status === 'failed' ? '生成失败，点开可重试' : '冒险生成中…'
                    )}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-mute">
                    {new Date(adv.started_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {(adv.status === 'pending_story' || adv.status === 'pending_image' || adv.status === 'pending') && (
                      <span className="inline-flex items-center gap-1 text-doodle-periwinkle"><Loader2 className="h-3 w-3 animate-spin" />生成中…</span>
                    )}
                    {adv.status === 'failed' && (
                      <span className="inline-flex items-center gap-1 text-doodle-coral"><AlertTriangle className="h-3 w-3" />失败</span>
                    )}
                  </p>
                </div>
              </Link>
            )
          })}
          {adventure_log.length === 0 && <p className="text-center text-mute">暂无冒险日志，等下次 WHOOP 同步触发自动冒险</p>}
        </div>
      </motion.div>

      {/* 成就墙 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="card-doodle"
      >
        <h2 className="mb-4 font-display text-xl font-bold">成就墙</h2>
        <div className="grid grid-cols-3 gap-4 md:grid-cols-6">
          {achievements.map((ach) => {
            const unlocked = ach.progress.status === 'unlocked'
            return (
              <div
                key={ach.id}
                className={`group relative rounded-xl border-2 border-ink p-4 text-center transition-all ${
                  unlocked ? 'bg-doodle-sunshine' : 'bg-cream opacity-40'
                }`}
              >
                <div className="mb-2 flex items-center justify-center">
                  {unlocked ? (
                    <Trophy className="h-8 w-8 text-ink" strokeWidth={2.5} />
                  ) : (
                    <Lock className="h-8 w-8 text-mute" strokeWidth={2.5} />
                  )}
                </div>
                <p className="text-xs font-bold">{ach.title}</p>
                {/* Hover tooltip */}
                <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden w-48 -translate-x-1/2 rounded-lg border-2 border-ink bg-paper p-2 text-xs shadow-doodle-md group-hover:block">
                  <p className="font-bold">{ach.title}</p>
                  <p className="text-mute">{ach.description}</p>
                  {!unlocked && (
                    <p className="mt-1 text-doodle-periwinkle">
                      {ach.progress.progress_current} / {ach.progress.progress_target}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}
