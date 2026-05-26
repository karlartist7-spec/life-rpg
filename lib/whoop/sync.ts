/**
 * WHOOP → events 同步器。
 *
 * 拉取近 N 天 recovery / sleep / cycle / workout，按 dedupe_key 幂等写入 events 表。
 * dedupe_key 格式：`whoop:<type>:<external_id>`（v2 API 返回的 id 是字符串 uuid）
 *
 * v2 API endpoints (per WHOOP docs):
 *   GET /v2/recovery
 *   GET /v2/activity/sleep
 *   GET /v2/cycle
 *   GET /v2/activity/workout
 * Query: start (ISO), end (ISO), limit (max 25), nextToken
 */

import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken } from './tokens'
import { whoopApiGet } from './client'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

type WhoopPaged<T> = { records: T[]; next_token?: string | null }

type WhoopRecovery = {
  cycle_id: number | string
  sleep_id: string
  user_id: number
  created_at: string
  updated_at: string
  score_state: string
  score?: {
    user_calibrating?: boolean
    recovery_score?: number
    resting_heart_rate?: number
    hrv_rmssd_milli?: number
    spo2_percentage?: number
    skin_temp_celsius?: number
  } | null
}

type WhoopSleep = {
  id: string
  user_id: number
  created_at: string
  updated_at: string
  start: string
  end: string
  timezone_offset: string
  nap: boolean
  score_state: string
  score?: {
    stage_summary?: {
      total_in_bed_time_milli?: number
      total_awake_time_milli?: number
      total_no_data_time_milli?: number
      total_light_sleep_time_milli?: number
      total_slow_wave_sleep_time_milli?: number
      total_rem_sleep_time_milli?: number
      sleep_cycle_count?: number
      disturbance_count?: number
    }
    sleep_needed?: {
      baseline_milli?: number
      need_from_sleep_debt_milli?: number
      need_from_recent_strain_milli?: number
      need_from_recent_nap_milli?: number
    }
    respiratory_rate?: number
    sleep_performance_percentage?: number
    sleep_consistency_percentage?: number
    sleep_efficiency_percentage?: number
  } | null
}

type WhoopCycle = {
  id: string | number
  user_id: number
  created_at: string
  updated_at: string
  start: string
  end?: string | null
  timezone_offset: string
  score_state: string
  score?: {
    strain?: number
    kilojoule?: number
    average_heart_rate?: number
    max_heart_rate?: number
  } | null
}

type WhoopWorkout = {
  id: string
  user_id: number
  created_at: string
  updated_at: string
  start: string
  end: string
  timezone_offset: string
  sport_id?: number
  sport_name?: string
  score_state: string
  score?: {
    strain?: number
    average_heart_rate?: number
    max_heart_rate?: number
    kilojoule?: number
    percent_recorded?: number
    distance_meter?: number
    altitude_gain_meter?: number
    altitude_change_meter?: number
    zone_durations?: Record<string, number>
  } | null
}

type EventRow = {
  user_id: string
  type: string
  source: string
  payload: unknown
  occurred_at: string
  dedupe_key: string
}

/* -------- 通用分页 -------- */

async function fetchAllPages<T>(opts: {
  accessToken: string
  path: string
  start: string
  end: string
  maxPages?: number
}): Promise<T[]> {
  const out: T[] = []
  let nextToken: string | null | undefined = undefined
  let pages = 0
  const cap = opts.maxPages ?? 20

  do {
    const query: Record<string, string> = {
      start: opts.start,
      end: opts.end,
      limit: '25',
    }
    if (nextToken) query.nextToken = nextToken
    const page = await whoopApiGet<WhoopPaged<T>>({
      path: opts.path,
      accessToken: opts.accessToken,
      query,
    })
    out.push(...(page.records || []))
    nextToken = page.next_token
    pages++
  } while (nextToken && pages < cap)

  return out
}

/* -------- 同步主流程 -------- */

export type SyncStats = {
  recovery: { fetched: number; inserted: number }
  sleep: { fetched: number; inserted: number }
  cycle: { fetched: number; inserted: number }
  workout: { fetched: number; inserted: number }
  rangeStart: string
  rangeEnd: string
}

export async function syncWhoopRange(opts: {
  userId: string
  days?: number
  start?: Date
  end?: Date
}): Promise<SyncStats> {
  const days = opts.days ?? 30
  const end = opts.end ?? new Date()
  const start = opts.start ?? new Date(end.getTime() - days * 24 * 60 * 60 * 1000)

  const { access_token } = await getValidAccessToken(opts.userId)
  const startISO = start.toISOString()
  const endISO = end.toISOString()

  const [recovery, sleep, cycle, workout] = await Promise.all([
    fetchAllPages<WhoopRecovery>({
      accessToken: access_token,
      path: '/v2/recovery',
      start: startISO,
      end: endISO,
    }),
    fetchAllPages<WhoopSleep>({
      accessToken: access_token,
      path: '/v2/activity/sleep',
      start: startISO,
      end: endISO,
    }),
    fetchAllPages<WhoopCycle>({
      accessToken: access_token,
      path: '/v2/cycle',
      start: startISO,
      end: endISO,
    }),
    fetchAllPages<WhoopWorkout>({
      accessToken: access_token,
      path: '/v2/activity/workout',
      start: startISO,
      end: endISO,
    }),
  ])

  const rows: EventRow[] = []

  for (const r of recovery) {
    rows.push({
      user_id: opts.userId,
      type: 'whoop.recovery',
      source: 'whoop',
      payload: r,
      occurred_at: r.created_at ?? new Date().toISOString(),
      dedupe_key: `whoop:recovery:${r.sleep_id}`,
    })
  }
  for (const s of sleep) {
    rows.push({
      user_id: opts.userId,
      type: 'whoop.sleep',
      source: 'whoop',
      payload: s,
      occurred_at: s.end ?? s.start,
      dedupe_key: `whoop:sleep:${s.id}`,
    })
  }
  for (const c of cycle) {
    rows.push({
      user_id: opts.userId,
      type: 'whoop.cycle',
      source: 'whoop',
      payload: c,
      occurred_at: c.end ?? c.start,
      dedupe_key: `whoop:cycle:${c.id}`,
    })
  }
  for (const w of workout) {
    rows.push({
      user_id: opts.userId,
      type: 'whoop.workout',
      source: 'whoop',
      payload: w,
      occurred_at: w.end ?? w.start,
      dedupe_key: `whoop:workout:${w.id}`,
    })
  }

  const supa = adminClient()
  let inserted = { recovery: 0, sleep: 0, cycle: 0, workout: 0 }

  // 幂等：dedupe_key 已存在则忽略 (events 表上需要 dedupe_key 唯一索引)
  if (rows.length > 0) {
    const { data, error } = await supa
      .from('events')
      .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('dedupe_key, type')

    if (error) throw new Error(`events upsert failed: ${error.message}`)
    for (const row of data ?? []) {
      if (row.type === 'whoop.recovery') inserted.recovery++
      if (row.type === 'whoop.sleep') inserted.sleep++
      if (row.type === 'whoop.cycle') inserted.cycle++
      if (row.type === 'whoop.workout') inserted.workout++
    }
  }

  return {
    recovery: { fetched: recovery.length, inserted: inserted.recovery },
    sleep: { fetched: sleep.length, inserted: inserted.sleep },
    cycle: { fetched: cycle.length, inserted: inserted.cycle },
    workout: { fetched: workout.length, inserted: inserted.workout },
    rangeStart: startISO,
    rangeEnd: endISO,
  }
}
