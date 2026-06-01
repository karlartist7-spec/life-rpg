/**
 * 单日结算器：把一个用户某一天的 events 折算成五维/EXP/任务/成就/连击/冒险日志。
 *
 * 输入：user_id + date (YYYY-MM-DD, 用户本地时区)
 * 输出：写入 daily_settlements / character_state / quest_progress / user_achievements / streaks / adventure_log
 *
 * 关键设计：
 * - **幂等**：daily_settlements(user_id, date) 是唯一键。重复跑同一天不会重复加 EXP，因为我们做 "diff and reapply"
 *   策略：先把这天上次结算的 delta 从 character_state 里减掉，再重新算+加。
 * - 没有任何相关数据时跳过，不写 0 行（除非用户明确要求 "no-data 标记"）。
 * - 时区：所有日期按用户 profile.timezone 切分（默认 Asia/Shanghai）。
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  computeDailyGains,
  applyExp,
  pickTitle,
  nextLevelExp,
  type DailySignals,
} from './scoring'

function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

/* ============== 时区辅助 ============== */

/** 取某 ISO timestamp 在指定时区下的 YYYY-MM-DD */
function isoDateInTz(iso: string, tz: string): string {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(d) // en-CA => YYYY-MM-DD
}

/* ============== 从 events 聚合一天的原始信号 ============== */

type DayEvents = {
  recovery: any[]
  sleep: any[]
  cycle: any[]
  workout: any[]
  manual: any[] // 手动 quest 打卡 / 阅读 / 社交
  commit: any[] // GitHub commit
}

async function loadDayEvents(
  supa: SupabaseClient,
  userId: string,
  date: string,
  tz: string
): Promise<DayEvents> {
  // 拉这天前后 ±2 天的 WHOOP 事件，再用 tz 精确过滤
  const dayStart = new Date(`${date}T00:00:00`)
  const padStart = new Date(dayStart.getTime() - 2 * 86400_000).toISOString()
  const padEnd = new Date(dayStart.getTime() + 3 * 86400_000).toISOString()

  const { data, error } = await supa
    .from('events')
    .select('id, type, source, payload, occurred_at')
    .eq('user_id', userId)
    .gte('occurred_at', padStart)
    .lte('occurred_at', padEnd)

  if (error) throw new Error(`loadDayEvents: ${error.message}`)

  const out: DayEvents = { recovery: [], sleep: [], cycle: [], workout: [], manual: [], commit: [] }
  for (const ev of data ?? []) {
    // 用 payload 内部的语义时间决定归属哪一天
    let when: string = ev.occurred_at
    if (ev.type === 'whoop.sleep') {
      // sleep 归属在 wake-up 那一天 (end 时间)
      when = ev.payload?.end ?? ev.occurred_at
    } else if (ev.type === 'whoop.recovery') {
      // recovery 归属在睡眠结束那一天
      when = ev.payload?.created_at ?? ev.occurred_at
    } else if (ev.type === 'whoop.cycle') {
      when = ev.payload?.start ?? ev.occurred_at
    } else if (ev.type === 'whoop.workout') {
      when = ev.payload?.start ?? ev.occurred_at
    }
    if (isoDateInTz(when, tz) !== date) continue

    if (ev.type === 'whoop.recovery') out.recovery.push(ev.payload)
    else if (ev.type === 'whoop.sleep' && !ev.payload?.nap) out.sleep.push(ev.payload)
    else if (ev.type === 'whoop.cycle') out.cycle.push(ev.payload)
    else if (ev.type === 'whoop.workout') out.workout.push(ev.payload)
    else if (ev.source === 'github') out.commit.push(ev.payload)
    else if (ev.source === 'manual' || ev.source === 'telegram') out.manual.push(ev.payload)
  }
  return out
}

/* ============== 把 events 归约成 DailySignals ============== */

function toSignals(
  date: string,
  day: DayEvents,
  hrvBaseline7d: number | null,
  streakCount: number,
  tasksCompleted: number,
  coreTasksDone: boolean
): DailySignals {
  // recovery: 取最大分（一般每天 1 条）
  const rec = day.recovery[0]
  const sleep = day.sleep.sort(
    (a, b) =>
      (b.score?.stage_summary?.total_in_bed_time_milli ?? 0) -
      (a.score?.stage_summary?.total_in_bed_time_milli ?? 0)
  )[0]
  // cycle: 取 strain 最大的那一条（理论一天一条）
  const cyc = day.cycle.sort((a, b) => (b.score?.strain ?? 0) - (a.score?.strain ?? 0))[0]

  // 睡眠时长 = total_in_bed - awake
  let sleepMinutes: number | null = null
  let sleepPerf: number | null = null
  if (sleep?.score?.stage_summary) {
    const inBed = sleep.score.stage_summary.total_in_bed_time_milli ?? 0
    const awake = sleep.score.stage_summary.total_awake_time_milli ?? 0
    sleepMinutes = Math.round((inBed - awake) / 60000)
    sleepPerf = sleep.score.sleep_performance_percentage ?? null
  }

  // 阅读 / 社交（manual events.meta.kind）
  let readingMinutes = 0
  let socialCount = 0
  for (const m of day.manual) {
    if (m?.kind === 'reading') readingMinutes += Number(m.minutes ?? 0)
    if (m?.kind === 'social') socialCount += 1
  }
  const commits = day.commit.length

  // 当日 strain：取「日周期 strain」与「当日最大单次训练 strain」的较大值。
  // WHOOP 的 cycle strain 有时同步滞后/偏低（如打了网球但 cycle 仍显示 ~0），
  // 单看 cycle 会漏掉训练；用 max(cycle, 最大 workout) 保证训练被计入。
  const cycleStrain = cyc?.score?.strain ?? 0
  const maxWorkoutStrain = day.workout.reduce(
    (m, w) => Math.max(m, w?.score?.strain ?? 0),
    0,
  )
  const hasStrainData = cyc != null || day.workout.length > 0
  const strain = hasStrainData ? Math.max(cycleStrain, maxWorkoutStrain) : null

  // 派生信号：strain 与 recovery 匹配度（spec: 高 recovery 高 strain 或低 recovery 适度休息）
  // 1 = 匹配良好  0 = 不匹配
  const rec_score = rec?.score?.recovery_score ?? null
  let strainRecoveryMatch = 0
  if (rec_score != null && strain != null) {
    // 高 recovery (≥67) 时 strain ≥ 12 算匹配（敢推）
    // 中 recovery (34-66) 时 strain 8-15 算匹配（适度）
    // 低 recovery (<34) 时 strain ≤ 10 算匹配（保命）
    if (rec_score >= 67 && strain >= 12) strainRecoveryMatch = 1
    else if (rec_score >= 34 && rec_score < 67 && strain >= 8 && strain <= 15) strainRecoveryMatch = 1
    else if (rec_score < 34 && strain <= 10) strainRecoveryMatch = 1
  }

  return {
    date,
    recoveryScore: rec_score,
    sleepMinutes,
    sleepPerformance: sleepPerf,
    hrv: rec?.score?.hrv_rmssd_milli ?? null,
    rhr: rec?.score?.resting_heart_rate ?? null,
    strain,
    workoutCount: day.workout.length,
    commits,
    readingMinutes,
    socialCount,
    tasksCompleted,
    streakCount,
    hrvBaseline7d,
    coreTasksDone,
    // @ts-expect-error 额外派生字段，给 quest evaluator 用
    strain_recovery_match: strainRecoveryMatch,
  }
}

/* ============== HRV 7 日基线 ============== */

async function hrvBaseline(
  supa: SupabaseClient,
  userId: string,
  date: string
): Promise<number | null> {
  const end = new Date(`${date}T00:00:00`)
  const start = new Date(end.getTime() - 8 * 86400_000)
  const { data } = await supa
    .from('events')
    .select('payload')
    .eq('user_id', userId)
    .eq('type', 'whoop.recovery')
    .gte('occurred_at', start.toISOString())
    .lt('occurred_at', end.toISOString())

  const vals: number[] = []
  for (const r of data ?? []) {
    const v = r.payload?.score?.hrv_rmssd_milli
    if (typeof v === 'number') vals.push(v)
  }
  if (vals.length < 3) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

/* ============== 任务/连击/成就计算 ============== */

async function evaluateQuests(
  supa: SupabaseClient,
  userId: string,
  date: string,
  signals: DailySignals
): Promise<{ completed: number; reasons: string[]; questUpdates: any[]; rewardExp: number }> {
  const { data: quests } = await supa.from('quests').select('*').eq('active', true).eq('scope', 'daily')
  const updates: any[] = []
  const reasons: string[] = []
  let completed = 0
  let rewardExp = 0

  // snake_case → camelCase 映射，DB 里的 metric 名兼容两种风格
  const metricAlias: Record<string, keyof DailySignals> = {
    recovery_score: 'recoveryScore',
    sleep_minutes: 'sleepMinutes',
    sleep_performance: 'sleepPerformance',
    reading_minutes: 'readingMinutes',
    social_count: 'socialCount',
    workout_count: 'workoutCount',
    tasks_completed: 'tasksCompleted',
    streak_count: 'streakCount',
    // 派生字段：保持 snake_case 与 DB 一致
    strain_recovery_match: 'strain_recovery_match' as any,
  }

  for (const q of quests ?? []) {
    const rawMetric = q.condition?.metric as string
    const metric = (metricAlias[rawMetric] ?? rawMetric) as keyof DailySignals
    const op = q.condition?.op as string
    const target = Number(q.condition?.value)
    const current = Number((signals as any)[metric] ?? 0)
    let done = false
    if (op === '>=') done = current >= target
    else if (op === '<=') done = current <= target
    else if (op === '==') done = current === target

    if (done) {
      completed++
      // 奖励 EXP：与 dashboard 显示的 reward_exp 一致（reward.exp 优先，回退 reward_exp）
      rewardExp += Number(q.reward?.exp ?? q.reward_exp ?? 0) || 0
      reasons.push(`任务完成：${q.title}`)
    }

    updates.push({
      user_id: userId,
      quest_id: q.id,
      progress_date: date,
      current_value: current,
      target_value: target,
      status: done ? 'completed' : 'pending',
      progress: { metric, op, target, current },
      completed_at: done ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
  }

  if (updates.length) {
    const { error } = await supa
      .from('quest_progress')
      .upsert(updates, { onConflict: 'user_id,quest_id,progress_date' })
    if (error) throw new Error(`quest_progress upsert: ${error.message}`)
  }

  return { completed, reasons, questUpdates: updates, rewardExp }
}

async function evaluateAchievements(
  supa: SupabaseClient,
  userId: string,
  date: string
): Promise<{ unlocked: { slug: string; title: string }[]; expBonus: number }> {
  // 简化版：用 daily_settlements 累计聚合检查
  const { data: ds } = await supa
    .from('daily_settlements')
    .select('date, recovery_score, sleep_minutes, strain, commits, reading_minutes, primary_attribute')
    .eq('user_id', userId)
    .lte('date', date)
    .order('date', { ascending: false })
    .limit(60)

  const days = ds ?? []
  const cumRecovery70 = days.filter((d) => (d.recovery_score ?? 0) >= 70).length
  const cumStrain12 = days.filter((d) => Number(d.strain ?? 0) >= 12).length
  const cumCommits = days.reduce((a, d) => a + (d.commits ?? 0), 0)
  const cumReading = days.reduce((a, d) => a + (d.reading_minutes ?? 0), 0)

  const checks: Record<string, { progress: number; target: number; done: boolean }> = {
    recovery_wizard: { progress: cumRecovery70, target: 10, done: cumRecovery70 >= 10 },
    code_knight:     { progress: cumCommits,    target: 100, done: cumCommits >= 100 },
    workout_hero:    { progress: cumStrain12,   target: 10, done: cumStrain12 >= 10 },
    book_worm:       { progress: cumReading,    target: 300, done: cumReading >= 300 },
    // early_bird / streak_monk 需要 streaks 表数据，v1 后续补
  }

  const { data: achs } = await supa.from('achievements').select('id, slug, title, reward')
  const unlocked: { slug: string; title: string }[] = []
  let expBonus = 0

  for (const a of achs ?? []) {
    const c = checks[a.slug]
    if (!c) continue
    const { data: existing } = await supa
      .from('user_achievements')
      .select('id, status')
      .eq('user_id', userId)
      .eq('achievement_id', a.id)
      .maybeSingle()

    const status = c.done ? 'unlocked' : c.progress > 0 ? 'in_progress' : 'locked'
    const row: any = {
      user_id: userId,
      achievement_id: a.id,
      progress_current: c.progress,
      progress_target: c.target,
      status,
    }
    if (c.done && existing?.status !== 'unlocked') {
      row.unlocked_at = new Date().toISOString()
      unlocked.push({ slug: a.slug, title: a.title })
      expBonus += Number(a.reward?.exp ?? 0)
    }
    const { error } = await supa
      .from('user_achievements')
      .upsert(row, { onConflict: 'user_id,achievement_id' })
    if (error) throw new Error(`user_achievements upsert: ${error.message}`)
  }

  return { unlocked, expBonus }
}

async function updateStreak(
  supa: SupabaseClient,
  userId: string,
  date: string,
  questCompleted: number
): Promise<number> {
  const success = questCompleted >= 3
  const { data: st } = await supa
    .from('streaks')
    .select('*')
    .eq('user_id', userId)
    .eq('streak_type', 'daily_goal')
    .maybeSingle()

  const today = date
  let current = st?.current_count ?? 0
  let longest = st?.longest_count ?? 0
  const last = st?.last_check_date

  if (success) {
    if (!last) current = 1
    else {
      const diffDays = Math.round(
        (new Date(today).getTime() - new Date(last).getTime()) / 86400_000
      )
      if (diffDays === 1) current += 1
      else if (diffDays === 0) {/* same day, no change */}
      else current = 1
    }
    longest = Math.max(longest, current)
  } else {
    if (last !== today) current = 0
  }

  const row = {
    user_id: userId,
    streak_type: 'daily_goal',
    current_count: current,
    longest_count: longest,
    last_check_date: success ? today : last,
    updated_at: new Date().toISOString(),
  }
  await supa.from('streaks').upsert(row, { onConflict: 'user_id,streak_type' })
  return current
}

/* ============== 冒险日志生成 ============== */

function buildAdventureLog(date: string, signals: DailySignals, gains: any, unlockedAch: any[]): any[] {
  const out: any[] = []
  const now = new Date(`${date}T22:00:00`).toISOString()

  if (signals.sleepMinutes) {
    const h = Math.floor(signals.sleepMinutes / 60)
    const m = signals.sleepMinutes % 60
    out.push({
      log_date: date,
      occurred_at: now,
      category: 'sleep',
      message: `睡眠完成：${h}h${String(m).padStart(2, '0')}`,
      exp_delta: gains.spr * 10,
      attr_delta: { spr: gains.spr },
    })
  }
  if (signals.recoveryScore != null) {
    out.push({
      log_date: date,
      occurred_at: now,
      category: 'recovery',
      message: `恢复 ${signals.recoveryScore.toFixed(0)}%`,
      exp_delta: 0,
      attr_delta: {},
    })
  }
  if (signals.strain != null && signals.strain > 0) {
    out.push({
      log_date: date,
      occurred_at: now,
      category: 'strain',
      message: `训练 Strain ${signals.strain.toFixed(1)}`,
      exp_delta: gains.vit * 10,
      attr_delta: { vit: gains.vit },
    })
  }
  if (signals.commits && signals.commits > 0) {
    out.push({
      log_date: date,
      occurred_at: now,
      category: 'commit',
      message: `Commit ${signals.commits} 次`,
      exp_delta: 0,
      attr_delta: { int: gains.int },
    })
  }
  if (signals.readingMinutes && signals.readingMinutes > 0) {
    out.push({
      log_date: date,
      occurred_at: now,
      category: 'reading',
      message: `阅读 ${signals.readingMinutes} 分钟`,
      exp_delta: 0,
      attr_delta: {},
    })
  }
  for (const a of unlockedAch) {
    out.push({
      log_date: date,
      occurred_at: now,
      category: 'achievement',
      message: `解锁成就：${a.title}`,
      exp_delta: 0,
      attr_delta: {},
    })
  }
  return out
}

/* ============== 主入口 ============== */

export type SettleResult = {
  date: string
  skipped: boolean
  reason?: string
  signals?: DailySignals
  gains?: any
  levelBefore?: number
  levelAfter?: number
  leveledUp?: boolean
  expGained?: number
  title?: string
  unlockedAchievements?: { slug: string; title: string }[]
}

export async function settleDay(opts: {
  userId: string
  date: string
  timezone?: string
}): Promise<SettleResult> {
  const supa = adminClient()
  const tz = opts.timezone ?? 'Asia/Shanghai'

  // 1. 拉当天 events
  const day = await loadDayEvents(supa, opts.userId, opts.date, tz)
  const hasAnyData =
    day.recovery.length || day.sleep.length || day.cycle.length || day.workout.length || day.commit.length || day.manual.length

  if (!hasAnyData) {
    return { date: opts.date, skipped: true, reason: 'no data' }
  }

  // 2. 准备辅助信号
  const baseline = await hrvBaseline(supa, opts.userId, opts.date)
  // streak count 先按上一日值算（精确值在 updateStreak 后写）
  const { data: streakRow } = await supa
    .from('streaks')
    .select('current_count')
    .eq('user_id', opts.userId)
    .eq('streak_type', 'daily_goal')
    .maybeSingle()
  const streakCountIn = streakRow?.current_count ?? 0

  // 3. 第一次结算：用临时 tasksCompleted=0/streakIn 算出 signals → 算 quests → 拿到真实 tasksCompleted
  let signals = toSignals(opts.date, day, baseline, streakCountIn, 0, false)
  const quests = await evaluateQuests(supa, opts.userId, opts.date, signals)
  const coreDone = quests.completed >= 3
  // 再算一次 (tasksCompleted/coreTasksDone 进 signals 影响 WIL 和 EXP)
  signals = toSignals(opts.date, day, baseline, streakCountIn, quests.completed, coreDone)
  const gains = computeDailyGains(signals)

  // 4. 之前若已结算过这天，先把旧 delta 撤回再加新值
  const { data: prev } = await supa
    .from('daily_settlements')
    .select('vit_gain, spr_gain, int_gain, wil_gain, cha_gain, exp_gained, exp_bonus, level_before')
    .eq('user_id', opts.userId)
    .eq('date', opts.date)
    .maybeSingle()

  const { data: charBefore } = await supa
    .from('character_state')
    .select('*')
    .eq('user_id', opts.userId)
    .single()

  let vit = charBefore.vit, spr = charBefore.spr, int_ = charBefore.int, wil = charBefore.wil, cha = charBefore.cha
  let level = charBefore.level, exp = charBefore.exp, totalExp = charBefore.total_exp

  if (prev) {
    // 旧 EXP 总量 = 基础 exp_gained + 奖励 exp_bonus（成就+任务）；回退时必须两者都减，
    // 否则每次重结算都会少掉一份 bonus（EXP 缩水）。
    const prevTotalExp = (prev.exp_gained ?? 0) + (prev.exp_bonus ?? 0)
    vit -= prev.vit_gain
    spr -= prev.spr_gain
    int_ -= prev.int_gain
    wil -= prev.wil_gain
    cha -= prev.cha_gain
    totalExp -= prevTotalExp
    // 等级/exp 回退到 prev.level_before + 把 exp 简单回退（近似：让 applyExp 重新走）
    // 注意：等级回退实际不严格反演，v1 接受"重算可能与历史不完全等价"的偏差
    if (prev.level_before != null) {
      const delta = level - prev.level_before
      level = prev.level_before
      // exp 简化：减掉 gained_exp+bonus 加回 nextLevelExp(level)*delta
      exp -= prevTotalExp
      for (let i = 0; i < delta; i++) exp += nextLevelExp(level + i)
      if (exp < 0) exp = 0
    }
  }

  const levelBefore = level
  vit += gains.vit
  spr += gains.spr
  int_ += gains.int
  wil += gains.wil
  cha += gains.cha

  // 5. 成就 (在累计前先写 daily_settlements, 但成就检查需要本日 strain/recovery 已入库——先 upsert ds，再算 ach)
  // 先确定 primary_attribute / title
  const title = pickTitle({ vit, spr, int: int_, wil, cha })

  // 6. 写 daily_settlements (含原始指标)
  const dsRow = {
    user_id: opts.userId,
    date: opts.date,
    vit_gain: gains.vit,
    spr_gain: gains.spr,
    int_gain: gains.int,
    wil_gain: gains.wil,
    cha_gain: gains.cha,
    exp_gained: gains.exp,
    level_before: levelBefore,
    primary_attribute: title.code,
    title_after: title.title,
    recovery_score: signals.recoveryScore ?? null,
    sleep_minutes: signals.sleepMinutes ?? null,
    sleep_performance: signals.sleepPerformance ?? null,
    hrv: signals.hrv ?? null,
    rhr: signals.rhr ?? null,
    strain: signals.strain ?? null,
    workout_count: signals.workoutCount ?? 0,
    commits: signals.commits ?? 0,
    reading_minutes: signals.readingMinutes ?? 0,
    social_count: signals.socialCount ?? 0,
    tasks_completed: quests.completed,
    exp_bonus: 0, // 下面覆盖
    leveled_up: false, // 下面覆盖
    level_after: 0,
    payload: { reasons: gains.reasons, questReasons: quests.reasons },
  }

  // 7. 算成就 (会用到 daily_settlements，先暂存当前值)
  await supa
    .from('daily_settlements')
    .upsert(dsRow, { onConflict: 'user_id,date' })

  const ach = await evaluateAchievements(supa, opts.userId, opts.date)
  // 奖励 EXP = 成就解锁奖励 + 任务奖励（dashboard 展示的 reward_exp）。
  // 与基础 gains.exp 分开记账，重结算时整体回退，避免缩水。
  const expBonus = ach.expBonus + (quests.rewardExp ?? 0)
  const expWithBonus = gains.exp + expBonus

  // 8. 应用 EXP / 升级
  const applied = applyExp(level, exp, totalExp, expWithBonus)

  // 9. 写 character_state
  await supa
    .from('character_state')
    .update({
      level: applied.level,
      exp: applied.exp,
      total_exp: applied.totalExp,
      vit, spr, int: int_, wil, cha,
      title: title.title,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', opts.userId)

  // 10. 回写 daily_settlements 真实 level_after / leveled_up
  // exp_gained 保持「基础」值，奖励单独存 exp_bonus（修复重结算 EXP 缩水）
  await supa
    .from('daily_settlements')
    .update({
      level_after: applied.level,
      leveled_up: applied.leveledUp,
      exp_gained: gains.exp,
      exp_bonus: expBonus,
    })
    .eq('user_id', opts.userId)
    .eq('date', opts.date)

  // 11. 连击
  await updateStreak(supa, opts.userId, opts.date, quests.completed)

  // 12. 冒险日志：先清掉本日旧 log，再插新的（幂等）
  await supa.from('adventure_log').delete().eq('user_id', opts.userId).eq('log_date', opts.date)
  const logRows = buildAdventureLog(opts.date, signals, gains, ach.unlocked)
  if (applied.leveledUp) {
    logRows.push({
      log_date: opts.date,
      occurred_at: new Date(`${opts.date}T22:00:00`).toISOString(),
      category: 'levelup',
      message: `升到 Lv.${applied.level}`,
      exp_delta: 0,
      attr_delta: {},
    })
  }
  if (logRows.length) {
    await supa.from('adventure_log').insert(
      logRows.map((r) => ({ ...r, user_id: opts.userId }))
    )
  }

  return {
    date: opts.date,
    skipped: false,
    signals,
    gains,
    levelBefore,
    levelAfter: applied.level,
    leveledUp: applied.leveledUp,
    expGained: expWithBonus,
    title: title.title,
    unlockedAchievements: ach.unlocked,
  }
}

/* ============== 30 天回填 ============== */

export async function backfillRange(opts: {
  userId: string
  days?: number
  timezone?: string
}): Promise<SettleResult[]> {
  const days = opts.days ?? 30
  const tz = opts.timezone ?? 'Asia/Shanghai'
  const today = new Date()
  const results: SettleResult[] = []

  // 从最早往今天结算，保证累计成就/连击正确
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400_000)
    const date = isoDateInTz(d.toISOString(), tz)
    try {
      const r = await settleDay({ userId: opts.userId, date, timezone: tz })
      results.push(r)
    } catch (e: any) {
      results.push({ date, skipped: true, reason: `error: ${e.message}` })
    }
  }
  return results
}
