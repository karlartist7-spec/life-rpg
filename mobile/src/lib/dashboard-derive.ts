import type { DashQuest } from './types'

export type RecoveryKey = 'high' | 'med' | 'low' | 'unknown'

/** WHOOP recovery zones: green ≥67, yellow 34–66, red <34. */
export function recoveryBucket(score: number | null): { key: RecoveryKey } {
  if (score == null) return { key: 'unknown' }
  if (score >= 67) return { key: 'high' }
  if (score >= 34) return { key: 'med' }
  return { key: 'low' }
}

export type DeltaDir = 'up' | 'down' | 'flat' | 'none'
export function delta(curr: number | null, prev: number | null): { dir: DeltaDir; diff: number } {
  if (curr == null || prev == null) return { dir: 'none', diff: 0 }
  const diff = curr - prev
  return { dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat', diff }
}

export function expPct(exp: number, next: number): number {
  if (next <= 0) return 100
  return Math.max(0, Math.min(100, (exp / next) * 100))
}

export function sleepHours(minutes: number | null): string {
  if (minutes == null) return '–'
  return (minutes / 60).toFixed(1)
}

export function questSummary(quests: Pick<DashQuest, 'progress' | 'reward_exp'>[]): {
  done: number
  total: number
  earnedExp: number
  totalExp: number
} {
  return quests.reduce(
    (acc, q) => {
      const completed = q.progress?.status === 'completed'
      return {
        done: acc.done + (completed ? 1 : 0),
        total: acc.total + 1,
        earnedExp: acc.earnedExp + (completed ? q.reward_exp : 0),
        totalExp: acc.totalExp + q.reward_exp,
      }
    },
    { done: 0, total: 0, earnedExp: 0, totalExp: 0 }
  )
}
