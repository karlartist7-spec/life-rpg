/**
 * Daily Morning Briefing cron (v3 - 合并 WHOOP 五维评分).
 *
 * 1. 同步最近 3 天 WHOOP → events
 * 2. 结算昨天和今天
 * 3. 抓 14 天历史 → 五维评分 + 风险惩罚 + 7 日趋势 + 数据驱动建议
 * 4. 生成合并版早报（RPG 升级数据 + 健康评分）
 * 5. 推 Telegram
 * 6. 写 morning_briefings (同日幂等)
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncWhoopRange } from '@/lib/whoop/sync'
import { settleDay, type SettleResult } from '@/lib/settlement'
import { sendTelegram } from '@/lib/telegram/sender'
import { calculateHealthScore, type HealthScore, type DayData } from '@/lib/health-scoring'
import { fetchDayDataRange } from '@/lib/health-data-fetch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

function isoDateInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
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

function buildBriefing(opts: {
  todayResult: SettleResult
  characterName: string
  level: number
  totalExp: number
  expToNext: number
  health: HealthScore | null
  yesterdayHealth: HealthScore | null
}): string {
  const r = opts.todayResult
  if (r.skipped || !r.signals) {
    return `☀️ *早安* — ${opts.characterName}\n\nWHOOP 还在评估今天，待会儿再看`
  }

  const s = r.signals!
  const g = r.gains!
  const lines: string[] = []
  const rec = s.recoveryScore ?? 0

  // === 标题 ===
  lines.push(`${recoveryEmoji(rec)} *早安* — *${opts.characterName}* Lv.${opts.level}`)

  // === 综合健康评分 ===
  if (opts.health) {
    const h = opts.health
    const yh = opts.yesterdayHealth
    const trend = yh ? trendArrow(h.total, yh.total) : ''
    lines.push('')
    lines.push(`📊 *综合 ${h.total.toFixed(0)}/100 · ${h.grade}* ${h.tag}${trend}`)
    lines.push(
      `恢复 ${h.dimensions.recovery.toFixed(0)}/30 · 睡眠 ${h.dimensions.sleep.toFixed(0)}/25 · 负荷 ${h.dimensions.strain.toFixed(0)}/20`
    )
    lines.push(`生理 ${h.dimensions.physio.toFixed(0)}/15 · 习惯 ${h.dimensions.habit.toFixed(0)}/10`)
  }

  // === 原始数据 ===
  lines.push('')
  if (s.recoveryScore != null) {
    lines.push(
      `💗 Recovery *${s.recoveryScore.toFixed(0)}%* · HRV ${s.hrv?.toFixed(0) ?? '–'}ms · RHR ${s.rhr ?? '–'}bpm`
    )
  }
  if (s.sleepMinutes) {
    const h = Math.floor(s.sleepMinutes / 60)
    const m = s.sleepMinutes % 60
    lines.push(`😴 睡眠 ${h}h${m}m · 表现 ${s.sleepPerformance?.toFixed(0) ?? '–'}%`)
  }
  if (s.strain != null) {
    lines.push(`⚡️ Strain ${s.strain.toFixed(1)}`)
  }

  // === RPG 收益 ===
  lines.push('')
  lines.push(`*+${r.expGained ?? 0} EXP*  (${opts.expToNext} → 升 Lv.${opts.level + 1})`)

  const attrs: string[] = []
  if (g.vit) attrs.push(`VIT +${g.vit}`)
  if (g.spr) attrs.push(`SPR +${g.spr}`)
  if (g.int) attrs.push(`INT +${g.int}`)
  if (g.wil) attrs.push(`WIL +${g.wil}`)
  if (g.cha) attrs.push(`CHA +${g.cha}`)
  if (attrs.length) lines.push(attrs.join(' · '))

  if (r.leveledUp) {
    lines.push('')
    lines.push(`🌟 *升级了！Lv.${r.levelBefore} → Lv.${r.levelAfter}* — 称号：${r.title}`)
  }
  if (r.unlockedAchievements && r.unlockedAchievements.length) {
    lines.push('')
    for (const a of r.unlockedAchievements) {
      lines.push(`🏆 解锁成就：*${a.title}*`)
    }
  }

  // === 风险预警 ===
  if (opts.health && opts.health.penalties.length > 0) {
    lines.push('')
    lines.push('⚠️ *风险预警*')
    for (const p of opts.health.penalties) {
      lines.push(`· ${p.reason} (${p.points})`)
    }
  }

  // === 数据驱动建议 ===
  if (opts.health && opts.health.advice.length > 0) {
    lines.push('')
    lines.push('💡 *今日建议*')
    for (const tip of opts.health.advice) {
      lines.push(`· ${tip}`)
    }
  } else {
    // fallback：旧的简单建议
    lines.push('')
    if (rec >= 67) lines.push('💪 状态很好，今天可以推自己一把')
    else if (rec >= 34) lines.push('⚖️ 中等状态，量力而行')
    else lines.push('🛌 今天保命要紧，少冲多休')
  }

  return lines.join('\n')
}

async function processUser(supa: ReturnType<typeof admin>, userId: string) {
  const { data: profile } = await supa
    .from('profiles')
    .select('telegram_chat_id, timezone')
    .eq('id', userId)
    .single()
  const tz = profile?.timezone ?? 'Asia/Shanghai'
  const today = isoDateInTz(new Date(), tz)
  const yesterday = isoDateInTz(new Date(Date.now() - 86400_000), tz)

  // 同日幂等
  const { data: existing } = await supa
    .from('morning_briefings')
    .select('id')
    .eq('user_id', userId)
    .eq('briefing_date', today)
    .maybeSingle()
  if (existing) return { user_id: userId, status: 'already-sent' }

  // 1. 拉最近 3 天 WHOOP
  try {
    await syncWhoopRange({ userId, days: 3 })
  } catch (e: any) {
    return { user_id: userId, status: 'error', detail: `sync: ${e?.message}` }
  }

  // 2. 检查今天到底有没有 recovery
  const { data: todayRec } = await supa
    .from('events')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'whoop.recovery')
    .gte('occurred_at', `${today}T00:00:00`)
    .limit(1)
    .maybeSingle()
  if (!todayRec) return { user_id: userId, status: 'no-recovery-yet' }

  // 3. 结算昨天 + 今天
  await settleDay({ userId, date: yesterday, timezone: tz }).catch(() => null)
  const todayResult = await settleDay({ userId, date: today, timezone: tz })

  // 4. 拿 14 天 DayData 算五维评分
  let health: HealthScore | null = null
  let yesterdayHealth: HealthScore | null = null
  try {
    const days14 = await fetchDayDataRange(supa, userId, today, 14, tz)
    const todayDay = days14.find((d) => d.date === today)
    const yesterdayDay = days14.find((d) => d.date === yesterday)
    const last14ExclToday = days14.filter((d) => d.date !== today)
    const last14ExclYesterday = days14.filter((d) => d.date !== yesterday && d.date < yesterday)

    if (todayDay) {
      // 早报跑在 8:00，用 hour=8 给 strain 中性分（strain 还没积累）
      health = calculateHealthScore(todayDay, last14ExclToday, 8)
    }
    if (yesterdayDay) {
      yesterdayHealth = calculateHealthScore(yesterdayDay, last14ExclYesterday, 23)
    }
  } catch (e: any) {
    console.error('[daily-morning] health score failed:', e?.message)
  }

  // 5. 拿角色当前态
  const { data: cs } = await supa
    .from('character_state')
    .select('name, level, exp, total_exp')
    .eq('user_id', userId)
    .single()

  const expToNext = 1000 + (cs?.level ?? 0) * 120 - (cs?.exp ?? 0)

  const message = buildBriefing({
    todayResult,
    characterName: cs?.name ?? 'Hermes',
    level: cs?.level ?? 1,
    totalExp: cs?.total_exp ?? 0,
    expToNext,
    health,
    yesterdayHealth,
  })

  // 6. 推 Telegram
  if (!profile?.telegram_chat_id) {
    await supa.from('morning_briefings').insert({
      user_id: userId,
      briefing_date: today,
      recovery_score: todayResult.signals?.recoveryScore,
      sleep_score: todayResult.signals?.sleepPerformance,
      hrv: todayResult.signals?.hrv,
      rhr: todayResult.signals?.rhr,
      message_text: message,
      delivery_target: 'none',
    })
    return { user_id: userId, status: 'no-telegram' }
  }

  const tg = await sendTelegram({ chatId: profile.telegram_chat_id, text: message })
  if (!tg.ok) return { user_id: userId, status: 'error', detail: `telegram: ${tg.error}` }

  await supa.from('morning_briefings').insert({
    user_id: userId,
    briefing_date: today,
    recovery_score: todayResult.signals?.recoveryScore,
    sleep_score: todayResult.signals?.sleepPerformance,
    hrv: todayResult.signals?.hrv,
    rhr: todayResult.signals?.rhr,
    message_text: message,
    delivery_target: `telegram:${profile.telegram_chat_id}`,
  })

  return {
    user_id: userId,
    status: 'sent',
    leveled_up: todayResult.leveledUp,
    unlocked: todayResult.unlockedAchievements,
    health_total: health?.total,
    health_grade: health?.grade,
  }
}

export async function GET(req: Request) {
  const isVercelCron = req.headers.get('x-vercel-cron') !== null
  const auth = req.headers.get('authorization')
  if (!isVercelCron && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 })
  }

  const supa = admin()
  const { data: tokens, error } = await supa.from('whoop_tokens').select('user_id')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const results = []
  for (const row of tokens ?? []) {
    try {
      results.push(await processUser(supa, row.user_id))
    } catch (e: any) {
      results.push({ user_id: row.user_id, status: 'error', detail: e?.message })
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}
