/**
 * 从 events 表抓最近 N 天 WHOOP 原始数据，组装成 health-scoring 用的 DayData[]
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DayData } from './health-scoring'

function isoDateInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export async function fetchDayDataRange(
  supa: SupabaseClient,
  userId: string,
  endDate: string,
  days: number,
  tz: string
): Promise<DayData[]> {
  const end = new Date(`${endDate}T23:59:59`)
  const start = new Date(end.getTime() - (days - 1) * 86400_000)
  const startISO = isoDateInTz(start, tz)

  const { data: events } = await supa
    .from('events')
    .select('type, payload, occurred_at')
    .eq('user_id', userId)
    .in('type', ['whoop.recovery', 'whoop.sleep', 'whoop.cycle', 'whoop.workout'])
    .gte('occurred_at', `${startISO}T00:00:00`)
    .lte('occurred_at', `${endDate}T23:59:59`)
    .order('occurred_at', { ascending: true })

  if (!events) return []

  // 按日期分组
  const byDate = new Map<string, DayData>()
  for (const ev of events) {
    const dateKey = isoDateInTz(new Date(ev.occurred_at), tz)
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, { date: dateKey, workouts: [] })
    }
    const day = byDate.get(dateKey)!
    const score = ev.payload?.score ?? ev.payload

    if (ev.type === 'whoop.recovery' && score) {
      day.recovery = {
        recovery_score: score.recovery_score,
        hrv_rmssd_milli: score.hrv_rmssd_milli,
        resting_heart_rate: score.resting_heart_rate,
        spo2_percentage: score.spo2_percentage,
        skin_temp_celsius: score.skin_temp_celsius,
      }
    } else if (ev.type === 'whoop.sleep' && score) {
      day.sleep = {
        sleep_performance_percentage: score.sleep_performance_percentage,
        sleep_efficiency_percentage: score.sleep_efficiency_percentage,
        stage_summary: score.stage_summary,
      }
    } else if (ev.type === 'whoop.cycle' && score) {
      day.cycle = {
        strain: score.strain,
        kilojoule: score.kilojoule,
        average_heart_rate: score.average_heart_rate,
      }
    } else if (ev.type === 'whoop.workout' && score) {
      day.workouts!.push({ strain: score.strain ?? 0 })
    }
  }

  // 当日有效 strain = max(日周期 strain, 当日最大单次训练 strain)。
  // WHOOP 的 cycle strain 有时漏算训练（如网球 cycle 仍 ~0），统一在此校正，
  // 让健康评分/早报与结算口径一致。
  for (const day of byDate.values()) {
    const maxWorkout = (day.workouts ?? []).reduce((m, w) => Math.max(m, w.strain ?? 0), 0)
    const cycleStrain = day.cycle?.strain ?? 0
    if (maxWorkout > cycleStrain) {
      day.cycle = {
        strain: maxWorkout,
        kilojoule: day.cycle?.kilojoule ?? 0,
        average_heart_rate: day.cycle?.average_heart_rate ?? 0,
      }
    }
  }

  // 按日期升序返回
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}
