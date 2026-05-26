'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import CountUp from 'react-countup'
import { Sparkles, TrendingUp, TrendingDown, Minus, Trophy, Lock, Check } from 'lucide-react'

interface DashboardData {
  user: { email: string; display_name: string | null; avatar_url: string | null }
  character: {
    name: string
    level: number
    current_exp: number
    next_level_exp: number
    title: string
    motto: string | null
    vit: number
    spr: number
    int: number
    wil: number
    cha: number
  }
  today: {
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
    vit: { value: number; today_delta: number; color: string; source: string }
    spr: { value: number; today_delta: number; color: string; source: string }
    int: { value: number; today_delta: number; color: string; source: string }
    wil: { value: number; today_delta: number; color: string; source: string }
    cha: { value: number; today_delta: number; color: string; source: string }
    last7: Array<{ date: string; vit: number; spr: number; int: number; wil: number; cha: number }>
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
    log_date: string
    occurred_at: string
    category: string
    message: string
    exp_delta: number | null
    attr_delta: any
  }>
  achievements: Array<{
    id: string
    slug: string
    title: string
    description: string
    icon_url: string | null
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
  rookie: 'Rookie Adventurer',
  recovery_wizard: 'Recovery Wizard',
  strain_runner: 'Strain Runner',
  code_knight: 'Code Knight',
  streak_monk: 'Streak Monk',
  social_bard: 'Social Bard',
}

const ATTR_COLORS: Record<string, string> = {
  mint: 'bg-doodle-mint',
  sky: 'bg-doodle-sky',
  lavender: 'bg-doodle-lilac',
  lemon: 'bg-doodle-sunshine',
  rose: 'bg-doodle-pink',
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

  const { character: c, today: t, attributes: attrs, quests, adventure_log, achievements } = data
  const expPercent = (c.current_exp / c.next_level_exp) * 100

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
            <p className="text-sm text-mute">{TITLE_MAP[c.title] || c.title}</p>
          </div>

          {/* EXP 进度条 */}
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-display font-bold">Lv.{c.level}</span>
              <span className="text-mute">
                <CountUp end={c.current_exp} duration={1} /> / {c.next_level_exp} EXP
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

          {/* 五维快览 */}
          <div className="flex gap-3">
            {attrs &&
              Object.entries(attrs)
                .filter(([k]) => k !== 'last7')
                .map(([key, val]: any) => (
                  <div key={key} className="text-center">
                    <div className={`mb-1 rounded-lg border-2 border-ink px-3 py-1 ${ATTR_COLORS[val.color]}`}>
                      <span className="font-display text-lg font-bold">{val.value}</span>
                    </div>
                    <span className="text-xs uppercase text-mute">{key}</span>
                  </div>
                ))}
          </div>
        </div>
      </motion.div>

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
        <h2 className="mb-4 font-display text-xl font-bold">冒险日志</h2>
        <div className="space-y-2">
          {adventure_log.slice(0, 5).map((log) => (
            <div key={log.id} className="rounded-lg border border-border bg-cream p-3 text-sm">
              <p className="text-ink-soft">{log.message}</p>
              <p className="mt-1 text-xs text-mute">
                {new Date(log.occurred_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))}
          {adventure_log.length === 0 && <p className="text-center text-mute">暂无日志</p>}
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
