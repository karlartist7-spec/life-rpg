'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Circle, Trophy, Flame, Moon, Activity, Dumbbell, Shuffle } from 'lucide-react'

interface Quest {
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
}

interface QuestsData {
  quests: Quest[]
}

const QUEST_ICONS: Record<string, any> = {
  recovery_60: Activity,
  sleep_7h: Moon,
  strain_12: Flame,
  workout_done: Dumbbell,
  strain_recovery_match: Shuffle,
}

const QUEST_COLORS: Record<string, string> = {
  recovery_60: 'bg-doodle-mint',
  sleep_7h: 'bg-doodle-sky',
  strain_12: 'bg-doodle-coral',
  workout_done: 'bg-doodle-sunshine',
  strain_recovery_match: 'bg-doodle-lilac',
}

export default function QuestsPage() {
  const [data, setData] = useState<QuestsData | null>(null)

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then(setData)
  }, [])

  if (!data) return <div className="card-doodle">Loading...</div>

  const completed = data.quests.filter((q) => q.progress.status === 'completed').length
  const totalExp = data.quests.reduce((s, q) => s + q.reward_exp, 0)
  const earnedExp = data.quests
    .filter((q) => q.progress.status === 'completed')
    .reduce((s, q) => s + q.reward_exp, 0)

  return (
    <div className="space-y-6">
      {/* 总览卡 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-doodle bg-doodle-sunshine"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">今日任务</h1>
            <p className="mt-1 text-ink-soft">
              {completed} / {data.quests.length} 已完成 · {earnedExp} / {totalExp} EXP
            </p>
          </div>
          <Trophy className="h-16 w-16 text-ink" strokeWidth={2.5} />
        </div>
      </motion.div>

      {/* 任务列表 */}
      <div className="grid gap-4 md:grid-cols-2">
        {data.quests.map((q, i) => {
          const Icon = QUEST_ICONS[q.slug] ?? Circle
          const color = QUEST_COLORS[q.slug] ?? 'bg-cream'
          const completed = q.progress.status === 'completed'
          const percent = Math.min(
            (q.progress.current_value / q.progress.target_value) * 100,
            100
          )

          return (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`card-doodle ${completed ? 'opacity-100' : 'opacity-95'}`}
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border-2 border-ink ${color}`}
                >
                  <Icon className="h-7 w-7 text-ink" strokeWidth={2.5} />
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display text-lg font-bold">{q.title}</h3>
                      <p className="text-sm text-mute">{q.description}</p>
                    </div>
                    {completed ? (
                      <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-doodle-mint" strokeWidth={2.5} />
                    ) : (
                      <Circle className="h-6 w-6 flex-shrink-0 text-mute" strokeWidth={2.5} />
                    )}
                  </div>

                  {/* Progress */}
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-bold">
                        {q.progress.current_value} / {q.progress.target_value}
                      </span>
                      <span className="text-doodle-periwinkle font-bold">+{q.reward_exp} EXP</span>
                    </div>
                    <div className="stat-bar h-3">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percent}%` }}
                        transition={{ duration: 0.8, delay: i * 0.1 }}
                        className={`stat-bar__fill ${completed ? 'bg-doodle-mint' : 'bg-doodle-periwinkle'}`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* 提示卡 */}
      <div className="card-doodle bg-cream">
        <p className="text-sm text-mute">
          <span className="font-bold text-ink">说明：</span>
          所有任务基于 WHOOP 数据自动结算，每天 8:00 推送早报。无需手动打卡。
        </p>
      </div>
    </div>
  )
}
