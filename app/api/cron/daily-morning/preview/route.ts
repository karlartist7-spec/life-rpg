/**
 * Preview endpoint - 预览指定日期完整早报（不发 TG，不写 DB）
 * GET /api/cron/daily-morning/preview?date=2026-05-26&full=1
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculateHealthScore, type HealthScore } from '@/lib/health-scoring'
import { fetchDayDataRange } from '@/lib/health-data-fetch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

function recoveryEmoji(score: number): string {
  if (score >= 67) return '🟢'
  if (score >= 34) return '🟡'
  return '🔴'
}

function trendArrow(curr: number | null, prev: number | null): string {
  if (curr == null || prev == null) return ''
  const diff = curr - prev
  if (Math.abs(diff) < 0.5) return ' →'
  return diff > 0 ? ` ↑${Math.abs(diff).toFixed(1)}` : ` ↓${Math.abs(diff).toFixed(1)}`
}

function buildPreviewBriefing(opts: {
  date: string
  characterName: string
  level: number
  totalExp: number
  expToNext: number
  health: HealthScore
  yesterdayHealth: HealthScore | null
  raw: any
}): string {
  const lines: string[] = []
  const rec = opts.raw.recovery?.recovery_score ?? 0
  lines.push(`${recoveryEmoji(rec)} *早安* — *${opts.characterName}* Lv.${opts.level}`)

  const h = opts.health
  const yh = opts.yesterdayHealth
  const trend = yh ? trendArrow(h.total, yh.total) : ''
  lines.push('')
  lines.push(`📊 *综合 ${h.total.toFixed(0)}/100 · ${h.grade}* ${h.tag}${trend}`)
  lines.push(
    `恢复 ${h.dimensions.recovery.toFixed(0)}/30 · 睡眠 ${h.dimensions.sleep.toFixed(0)}/25 · 负荷 ${h.dimensions.strain.toFixed(0)}/20`
  )
  lines.push(`生理 ${h.dimensions.physio.toFixed(0)}/15 · 习惯 ${h.dimensions.habit.toFixed(0)}/10`)

  lines.push('')
  lines.push(
    `💗 Recovery *${rec}%* · HRV ${opts.raw.recovery?.hrv_rmssd_milli?.toFixed(0) ?? '–'}ms · RHR ${opts.raw.recovery?.resting_heart_rate ?? '–'}bpm`
  )
  if (opts.raw.sleep?.stage_summary) {
    const inBed = opts.raw.sleep.stage_summary.total_in_bed_time_milli
    const awake = opts.raw.sleep.stage_summary.total_awake_time_milli
    const min = Math.round((inBed - awake) / 60000)
    lines.push(`😴 睡眠 ${Math.floor(min / 60)}h${min % 60}m · 表现 ${opts.raw.sleep.sleep_performance_percentage?.toFixed(0) ?? '–'}%`)
  }
  if (opts.raw.cycle?.strain != null) {
    lines.push(`⚡️ Strain ${opts.raw.cycle.strain.toFixed(1)}`)
  }

  lines.push('')
  lines.push(`*[模拟] +XX EXP*  (${opts.expToNext} → 升 Lv.${opts.level + 1})`)

  if (h.penalties.length > 0) {
    lines.push('')
    lines.push('⚠️ *风险预警*')
    for (const p of h.penalties) lines.push(`· ${p.reason} (${p.points})`)
  }

  if (h.advice.length > 0) {
    lines.push('')
    lines.push('💡 *今日建议*')
    for (const tip of h.advice) lines.push(`· ${tip}`)
  }

  return lines.join('\n')
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 })
  }
  const u = new URL(req.url)
  const date = u.searchParams.get('date')
  const full = u.searchParams.get('full') === '1'
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const supa = admin()
  const { data: tokens } = await supa.from('whoop_tokens').select('user_id').limit(1)
  const userId = tokens?.[0]?.user_id
  if (!userId) return NextResponse.json({ error: 'no user' }, { status: 404 })

  const tz = 'Asia/Shanghai'
  const days14 = await fetchDayDataRange(supa, userId, date, 14, tz)
  const todayDay = days14.find((d) => d.date === date)
  if (!todayDay) return NextResponse.json({ error: 'no data for date', days_found: days14.map((d) => d.date) }, { status: 404 })

  // 昨天日期
  const yesterdayDate = new Date(`${date}T00:00:00+08:00`)
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayStr = yesterdayDate.toISOString().slice(0, 10)
  const yesterdayDay = days14.find((d) => d.date === yesterdayStr)

  const last14ExclToday = days14.filter((d) => d.date !== date)
  const last14ExclYesterday = days14.filter((d) => d.date !== yesterdayStr && d.date < yesterdayStr)
  const health = calculateHealthScore(todayDay, last14ExclToday, 8)
  const yesterdayHealth = yesterdayDay ? calculateHealthScore(yesterdayDay, last14ExclYesterday, 23) : null

  if (full) {
    const { data: cs } = await supa
      .from('character_state')
      .select('name, level, exp, total_exp')
      .eq('user_id', userId)
      .single()
    const expToNext = 1000 + (cs?.level ?? 0) * 120 - (cs?.exp ?? 0)
    const message = buildPreviewBriefing({
      date,
      characterName: cs?.name ?? 'Hermes',
      level: cs?.level ?? 1,
      totalExp: cs?.total_exp ?? 0,
      expToNext,
      health,
      yesterdayHealth,
      raw: todayDay,
    })
    return new NextResponse(message, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  return NextResponse.json({ date, days_in_range: days14.length, today_raw: todayDay, health, yesterdayHealth })
}
