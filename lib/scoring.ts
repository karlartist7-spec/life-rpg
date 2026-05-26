/**
 * Life-RPG 五维属性 + EXP + 升级 + 称号公式
 * 完全按 spec v1 §6/§7/§5 实现
 *
 * spec: docs/spec-v1.md
 */

export type DailySignals = {
  date: string // YYYY-MM-DD
  // WHOOP
  recoveryScore?: number | null
  sleepMinutes?: number | null
  sleepPerformance?: number | null
  hrv?: number | null
  rhr?: number | null
  strain?: number | null
  workoutCount?: number | null
  // GitHub / 阅读 / 社交（后续接入）
  commits?: number | null
  readingMinutes?: number | null
  socialCount?: number | null
  // 任务/连击
  tasksCompleted?: number | null // 今日完成任务数
  streakCount?: number | null // 当前连击天数（用于 WIL 加成）
  // 7 日 HRV 均值（用于 SPR 中 "HRV 高于 7 日均值"）
  hrvBaseline7d?: number | null
  // 是否完成核心任务（用于 WIL 中 "Recovery<40 但完成核心任务"）
  coreTasksDone?: boolean
}

export type AttrDelta = {
  vit: number
  spr: number
  int: number
  wil: number
  cha: number
}

export type DailyGains = AttrDelta & {
  exp: number
  reasons: string[]
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/* ============== 五维 delta ============== */

export function computeVit(s: DailySignals): { delta: number; reasons: string[] } {
  const r: string[] = []
  let v = 0
  if (s.recoveryScore != null && s.recoveryScore >= 60) { v += 1; r.push(`Recovery ${s.recoveryScore.toFixed(0)} (+1 VIT)`) }
  if (s.strain != null && s.strain >= 12) { v += 1; r.push(`Strain ${s.strain.toFixed(1)} (+1 VIT)`) }
  if (s.strain != null && s.strain >= 14) { v += 1; r.push(`Strain ≥14 (额外 +1 VIT)`) }
  if (s.workoutCount && s.workoutCount > 0) { v += 1; r.push(`${s.workoutCount} 次训练 (+1 VIT)`) }
  return { delta: clamp(v, 0, 3), reasons: r }
}

export function computeSpr(s: DailySignals): { delta: number; reasons: string[] } {
  const r: string[] = []
  let v = 0
  if (s.sleepMinutes != null && s.sleepMinutes >= 420) { v += 1; r.push(`睡眠 ${(s.sleepMinutes / 60).toFixed(1)}h (+1 SPR)`) }
  if (s.sleepPerformance != null && s.sleepPerformance >= 85) { v += 1; r.push(`睡眠表现 ${s.sleepPerformance.toFixed(0)}% (+1 SPR)`) }
  if (s.recoveryScore != null && s.recoveryScore >= 70) { v += 1; r.push(`Recovery ${s.recoveryScore.toFixed(0)} ≥70 (+1 SPR)`) }
  if (s.hrv != null && s.hrvBaseline7d != null && s.hrv > s.hrvBaseline7d) {
    v += 1; r.push(`HRV ${s.hrv.toFixed(0)}ms 高于 7d 均值 (+1 SPR)`)
  }
  return { delta: clamp(v, 0, 3), reasons: r }
}

export function computeInt(s: DailySignals): { delta: number; reasons: string[] } {
  const r: string[] = []
  let v = 0
  const c = s.commits ?? 0
  if (c >= 1) { v += 1; r.push(`Commit ${c} (+1 INT)`) }
  if (c >= 3) { v += 1; r.push(`Commit ≥3 (额外 +1 INT)`) }
  if (c >= 5) { v += 1; r.push(`Commit ≥5 (额外 +1 INT)`) }
  if (s.readingMinutes && s.readingMinutes >= 30) { v += 2; r.push(`阅读 ${s.readingMinutes}min (+2 INT)`) }
  return { delta: clamp(v, 0, 4), reasons: r }
}

export function computeWil(s: DailySignals): { delta: number; reasons: string[] } {
  const r: string[] = []
  let v = 0
  if ((s.tasksCompleted ?? 0) >= 3) { v += 1; r.push(`完成 ${s.tasksCompleted} 个任务 (+1 WIL)`) }
  if ((s.streakCount ?? 0) >= 7) { v += 1; r.push(`Streak ${s.streakCount} 天 (+1 WIL)`) }
  if ((s.streakCount ?? 0) >= 15) { v += 1; r.push(`Streak ≥15 (额外 +1 WIL)`) }
  if (s.recoveryScore != null && s.recoveryScore < 40 && s.coreTasksDone) {
    v += 2
    r.push(`低 recovery 仍完成核心任务 (+2 WIL)`)
  }
  return { delta: clamp(v, 0, 3), reasons: r }
}

export function computeCha(s: DailySignals): { delta: number; reasons: string[] } {
  const r: string[] = []
  const sc = s.socialCount ?? 0
  let v = 0
  if (sc >= 1) { v += 1; r.push(`社交 ${sc} 次 (+1 CHA)`) }
  // 详细分级（饭局/演讲）后续从 events.meta 读，v1 简化版只看 count
  return { delta: clamp(v, 0, 4), reasons: r }
}

/* ============== EXP 公式 ============== */

export function computeExp(d: AttrDelta, tasksCompleted: number): number {
  return (
    d.vit * 10 +
    d.spr * 10 +
    d.int * 10 +
    d.wil * 12 +
    d.cha * 10 +
    tasksCompleted * 5
  )
}

/* ============== 单日总结算 ============== */

export function computeDailyGains(s: DailySignals): DailyGains {
  const vit = computeVit(s)
  const spr = computeSpr(s)
  const int_ = computeInt(s)
  const wil = computeWil(s)
  const cha = computeCha(s)

  const delta: AttrDelta = {
    vit: vit.delta,
    spr: spr.delta,
    int: int_.delta,
    wil: wil.delta,
    cha: cha.delta,
  }
  const exp = computeExp(delta, s.tasksCompleted ?? 0)

  return {
    ...delta,
    exp,
    reasons: [
      ...vit.reasons,
      ...spr.reasons,
      ...int_.reasons,
      ...wil.reasons,
      ...cha.reasons,
    ],
  }
}

/* ============== 升级曲线 ============== */
// spec §7: next_level_exp = 1000 + current_level * 120

export function nextLevelExp(level: number): number {
  return 1000 + level * 120
}

/**
 * 给当前 (level, exp_in_level) 累加 gain，返回新 (level, exp_in_level, levels_up, total_exp_delta)
 */
export function applyExp(
  currentLevel: number,
  currentExpInLevel: number,
  totalExp: number,
  gain: number
): {
  level: number
  exp: number
  totalExp: number
  leveledUp: boolean
  levelsGained: number
} {
  let level = currentLevel
  let exp = currentExpInLevel + gain
  let leveledUp = false
  let levelsGained = 0

  while (exp >= nextLevelExp(level)) {
    exp -= nextLevelExp(level)
    level += 1
    leveledUp = true
    levelsGained += 1
    if (level > 999) break
  }

  return {
    level,
    exp,
    totalExp: totalExp + gain,
    leveledUp,
    levelsGained,
  }
}

/* ============== 称号规则 ============== */
// spec §4.3: 五维最高那一项决定称号；数据不足 → Rookie Adventurer

export type TitleResult = {
  title: string
  code: 'recovery_wizard' | 'strain_runner' | 'code_knight' | 'streak_monk' | 'social_bard' | 'rookie'
}

export function pickTitle(attrs: {
  vit: number
  spr: number
  int: number
  wil: number
  cha: number
}): TitleResult {
  const entries: [keyof typeof attrs, number][] = [
    ['vit', attrs.vit],
    ['spr', attrs.spr],
    ['int', attrs.int],
    ['wil', attrs.wil],
    ['cha', attrs.cha],
  ]
  const max = Math.max(...entries.map((e) => e[1]))
  // 全部 ≤ 默认初始（50），算 Rookie
  if (max <= 50) return { title: 'Rookie Adventurer', code: 'rookie' }

  const top = entries.find((e) => e[1] === max)![0]
  switch (top) {
    case 'spr': return { title: 'Recovery Wizard',  code: 'recovery_wizard' }
    case 'vit': return { title: 'Strain Runner',    code: 'strain_runner' }
    case 'int': return { title: 'Code Knight',      code: 'code_knight' }
    case 'wil': return { title: 'Streak Monk',      code: 'streak_monk' }
    case 'cha': return { title: 'Social Bard',      code: 'social_bard' }
  }
}
