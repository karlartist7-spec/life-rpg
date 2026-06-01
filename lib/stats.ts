/**
 * 三维属性 + 体力计算引擎
 *
 * 数据流：daily_settlements (WHOOP 真信号 30 天) → 三维 + 当日体力 → character_state
 *
 * 三维（0-100，clamp）：
 *   - physique  体魄 = avg(recovery_score) 30d
 *   - endurance 耐力 = avg(strain) × 5 + avg(sleep_min)/480 × 50
 *   - focus     专注 = avg(sleep_performance) × 0.5 + avg(hrv)/120 × 50
 *
 * 当日体力（醒来一次性算）：
 *   stamina = sleep_min × (recovery/100) × (1 + strain/20)
 *
 * 场景档位（体力越高去越远越稀有）：
 *   <100  近郊  common
 *   <250  海岸  rare
 *   <400  遗迹  epic
 *   ≥400  异界  legendary
 */

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_SRV = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function sb<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPA_SRV,
      Authorization: `Bearer ${SUPA_SRV}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  })
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`)
  const text = await r.text()
  return text ? JSON.parse(text) : (null as T)
}

export type SceneTier = 'nearby' | 'coast' | 'ruin' | 'astral'
export type RarityTier = 'common' | 'rare' | 'epic' | 'legendary'

export interface ThreeAttrs {
  physique: number
  endurance: number
  focus: number
  hp_max: number
}

export interface TodayStamina {
  stamina: number
  scene_tier: SceneTier
  rarity_tier: RarityTier
  sleep_min: number | null
  recovery: number | null
  strain: number | null
}

interface DailySettlementRow {
  date: string
  recovery_score: number | null
  sleep_minutes: number | null
  sleep_performance: number | null
  strain: number | null
  hrv: number | null
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))

/** 计算三维属性（最近 30 天滚动） */
export async function computeUserStats(userId: string): Promise<ThreeAttrs> {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
  const rows = await sb<DailySettlementRow[]>(
    `daily_settlements?user_id=eq.${userId}&date=gte.${since}&select=date,recovery_score,sleep_minutes,sleep_performance,strain,hrv&order=date.desc`,
  )

  if (!rows || rows.length === 0) {
    return { physique: 10, endurance: 10, focus: 10, hp_max: 100 }
  }

  const avg = (xs: Array<number | null | undefined>): number => {
    const v = xs.filter((x): x is number => typeof x === 'number')
    return v.length === 0 ? 0 : v.reduce((s, x) => s + x, 0) / v.length
  }

  const recoveryAvg = avg(rows.map((r) => r.recovery_score))
  const strainAvg = avg(rows.map((r) => r.strain))
  const sleepMinAvg = avg(rows.map((r) => r.sleep_minutes))
  const sleepPerfAvg = avg(rows.map((r) => r.sleep_performance))
  const hrvAvg = avg(rows.map((r) => r.hrv))

  const physique = Math.round(clamp(recoveryAvg))
  // 耐力 = 日均 strain × 5 + 日均睡眠时长占比 × 50（两项都用"日均"口径，
  // 修复原先 strainSum/固定30 在数据不足 30 天时严重低估的问题）
  const endurance = Math.round(clamp(strainAvg * 5 + (sleepMinAvg / 480) * 50))
  const focus = Math.round(clamp(sleepPerfAvg * 0.5 + (hrvAvg / 120) * 50))

  const hp_max = Math.max(50, Math.min(200, Math.round(50 + physique * 1.5)))

  return { physique, endurance, focus, hp_max }
}

/** 当日体力 + 场景档位 */
export async function computeTodayStamina(
  userId: string,
  date: string, // YYYY-MM-DD
): Promise<TodayStamina> {
  const rows = await sb<DailySettlementRow[]>(
    `daily_settlements?user_id=eq.${userId}&date=eq.${date}&select=recovery_score,sleep_minutes,strain&limit=1`,
  )

  const row = rows?.[0]
  if (!row || row.sleep_minutes == null || row.recovery_score == null) {
    return {
      stamina: 0,
      scene_tier: 'nearby',
      rarity_tier: 'common',
      sleep_min: row?.sleep_minutes ?? null,
      recovery: row?.recovery_score ?? null,
      strain: row?.strain ?? null,
    }
  }

  const sleep_min = row.sleep_minutes
  const recovery = row.recovery_score
  const strain = row.strain ?? 0
  const stamina = Math.round(sleep_min * (recovery / 100) * (1 + strain / 20))

  const scene_tier: SceneTier =
    stamina < 100 ? 'nearby' : stamina < 250 ? 'coast' : stamina < 400 ? 'ruin' : 'astral'
  const rarity_tier: RarityTier =
    stamina < 100 ? 'common' : stamina < 250 ? 'rare' : stamina < 400 ? 'epic' : 'legendary'

  return { stamina, scene_tier, rarity_tier, sleep_min, recovery, strain }
}

/** 把三维 + 当日体力写回 character_state（幂等：当日已算过会跳过） */
export async function applyStatsToCharacter(
  userId: string,
  opts: { force?: boolean; date?: string } = {},
): Promise<{
  applied: boolean
  reason?: string
  stats: ThreeAttrs
  today: TodayStamina
}> {
  const todayDate =
    opts.date ??
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())

  const existing = await sb<Array<{ today_stats_date: string | null; hp_current: number }>>(
    `character_state?user_id=eq.${userId}&select=today_stats_date,hp_current`,
  )
  const cs = existing?.[0]

  const [stats, today] = await Promise.all([
    computeUserStats(userId),
    computeTodayStamina(userId, todayDate),
  ])

  if (!opts.force && cs?.today_stats_date === todayDate) {
    return { applied: false, reason: 'already-applied-today', stats, today }
  }

  // 今日是否已有真实 WHOOP 数据（睡眠+恢复都在 daily_settlements 里）
  // 没有就先不锁 today_stats_date，避免在 WHOOP 数据到达前把体力锁死在 0，
  // 让下次调用（cron/sync/trigger）能重算。
  const hasTodayData = today.sleep_min != null && today.recovery != null

  // hp_current 只在「当日首次结算」(today_stats_date 变化) 时重置为满血（睡醒满血）。
  // 否则即便 force（手动重新同步）也不重置，避免把白天冒险消耗的 HP 又刷满（exploit/回档）。
  const isFirstWakeToday = cs?.today_stats_date !== todayDate

  const patch: Record<string, unknown> = {
    physique: stats.physique,
    endurance: stats.endurance,
    focus: stats.focus,
    hp_max: stats.hp_max,
    today_stamina: today.stamina,
    today_scene_tier: today.scene_tier,
    today_rarity_tier: today.rarity_tier,
    today_stats_date: hasTodayData ? todayDate : null,
    updated_at: new Date().toISOString(),
  }
  if (isFirstWakeToday && hasTodayData) patch.hp_current = stats.hp_max

  await sb(`character_state?user_id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })

  return { applied: true, stats, today }
}

/** 给 LM 用的中文场景描述 */
export const SCENE_TIER_LABEL: Record<SceneTier, string> = {
  nearby: '近郊',
  coast: '海岸',
  ruin: '遗迹',
  astral: '异界',
}

export const SCENE_TIER_TYPES: Record<SceneTier, string[]> = {
  nearby: ['forest', 'town'],
  coast: ['ocean', 'mountain'],
  ruin: ['ruin', 'cave'],
  astral: ['astral'],
}
