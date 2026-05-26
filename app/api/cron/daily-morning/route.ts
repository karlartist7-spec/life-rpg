/**
 * Daily Morning Briefing cron.
 *
 * 触发：Vercel Cron 每 10 分钟一次。
 * 校验：x-vercel-cron header 或 Authorization: Bearer CRON_SECRET。
 *
 * 逻辑：
 *   1. 找所有有 whoop_tokens 的用户
 *   2. 对每个用户：
 *      a. 查今天有没推过早报（morning_briefings UNIQUE） → 推过就跳
 *      b. 查 events 表今天有没有 recovery 事件 → 没有就跳（说明 WHOOP 还没结算 = 没起床）
 *      c. 用 access_token 拉今天的 recovery + sleep + cycle 详情
 *      d. 生成早报文本
 *      e. 发 Telegram（如果 profiles.telegram_chat_id 存在）
 *      f. 写 morning_briefings 幂等记录
 *
 * 注意：
 *   - 单次执行不能跑超 10s（Vercel hobby plan），所以失败就丢 log 继续下一个用户
 *   - 错过的早报不补；明天又是新的一天
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken } from '@/lib/whoop/tokens'
import { whoopApiGet } from '@/lib/whoop/client'
import { sendTelegram } from '@/lib/telegram/sender'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Vercel pro 是 60s

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

function todayInTZ(tz: string): string {
  // 返回 YYYY-MM-DD 在指定时区
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

type RecoveryV2 = {
  cycle_id: number
  sleep_id: string
  user_id: number
  created_at: string
  updated_at: string
  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE'
  score?: {
    user_calibrating: boolean
    recovery_score: number
    resting_heart_rate: number
    hrv_rmssd_milli: number
    spo2_percentage?: number
    skin_temp_celsius?: number
  }
}

type SleepV2 = {
  id: string
  start: string
  end: string
  score_state: string
  score?: {
    sleep_performance_percentage?: number
    sleep_efficiency_percentage?: number
    sleep_consistency_percentage?: number
    stage_summary?: {
      total_in_bed_time_milli: number
      total_awake_time_milli: number
      total_no_data_time_milli: number
      total_light_sleep_time_milli: number
      total_slow_wave_sleep_time_milli: number
      total_rem_sleep_time_milli: number
      sleep_cycle_count: number
      disturbance_count: number
    }
  }
}

function emojiForRecovery(score: number): string {
  if (score >= 67) return '🟢'
  if (score >= 34) return '🟡'
  return '🔴'
}

function fmtSleep(ms: number): string {
  const totalMin = Math.round(ms / 1000 / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h${m}m`
}

function buildBriefing(opts: {
  recovery: RecoveryV2
  sleep: SleepV2 | null
}): string {
  const r = opts.recovery.score
  if (!r) {
    return '☀️ *早呀* — WHOOP 还在评估今天的恢复，稍后再看吧'
  }

  const emoji = emojiForRecovery(r.recovery_score)
  const lines: string[] = []
  lines.push(`${emoji} *早安* — Recovery *${r.recovery_score}%*`)
  lines.push('')
  lines.push(`💗 HRV ${r.hrv_rmssd_milli.toFixed(0)}ms · RHR ${r.resting_heart_rate}bpm`)

  if (opts.sleep?.score) {
    const s = opts.sleep.score
    const stage = s.stage_summary
    if (stage) {
      const slept = stage.total_in_bed_time_milli - stage.total_awake_time_milli
      lines.push(`😴 睡眠 ${fmtSleep(slept)} · 效率 ${s.sleep_efficiency_percentage?.toFixed(0) ?? '–'}%`)
      lines.push(`   REM ${fmtSleep(stage.total_rem_sleep_time_milli)} · 深睡 ${fmtSleep(stage.total_slow_wave_sleep_time_milli)}`)
    }
    if (s.sleep_performance_percentage != null) {
      lines.push(`📊 睡眠表现 ${s.sleep_performance_percentage.toFixed(0)}%`)
    }
  }

  lines.push('')
  if (r.recovery_score >= 67) {
    lines.push('💪 状态很好，可以推自己一把')
  } else if (r.recovery_score >= 34) {
    lines.push('⚖️ 中等状态，量力而行')
  } else {
    lines.push('🛌 今天保命要紧，少冲多休')
  }

  return lines.join('\n')
}

async function processUser(supa: ReturnType<typeof admin>, userId: string): Promise<{
  user_id: string
  status: 'sent' | 'skipped' | 'no-recovery' | 'no-telegram' | 'already-sent' | 'error'
  detail?: string
}> {
  // 拿 profile 知道时区 + telegram_chat_id
  const { data: profile } = await supa
    .from('profiles')
    .select('telegram_chat_id, timezone')
    .eq('id', userId)
    .single()

  const tz = profile?.timezone ?? 'Asia/Shanghai'
  const today = todayInTZ(tz)

  // 已推过？
  const { data: existing } = await supa
    .from('morning_briefings')
    .select('id')
    .eq('user_id', userId)
    .eq('briefing_date', today)
    .maybeSingle()
  if (existing) return { user_id: userId, status: 'already-sent' }

  // 今天有 recovery event 吗？（WHOOP webhook 应该把它写进 events）
  // 但如果 webhook 还没建好或漏了，我们也主动拉一次 WHOOP API
  const valid = await getValidAccessToken(userId).catch(() => null)
  if (!valid) return { user_id: userId, status: 'error', detail: 'no-valid-token' }

  // 拉今天的 recovery（v2 cycle endpoint 返回最新 cycle）
  const cycles = await whoopApiGet<{ records: { id: number; start: string; end?: string }[] }>({
    path: '/v2/cycle',
    accessToken: valid.access_token,
    query: { limit: '5' },
  }).catch(() => null)

  if (!cycles || cycles.records.length === 0) {
    return { user_id: userId, status: 'no-recovery', detail: 'no cycles' }
  }

  // 最新 cycle 的 recovery
  const latestCycle = cycles.records[0]
  const recovery = await whoopApiGet<RecoveryV2>({
    path: `/v2/cycle/${latestCycle.id}/recovery`,
    accessToken: valid.access_token,
  }).catch(() => null)

  if (!recovery || recovery.score_state !== 'SCORED') {
    return { user_id: userId, status: 'no-recovery', detail: `state=${recovery?.score_state ?? 'null'}` }
  }

  // 拉关联的 sleep
  let sleep: SleepV2 | null = null
  if (recovery.sleep_id) {
    sleep = await whoopApiGet<SleepV2>({
      path: `/v2/activity/sleep/${recovery.sleep_id}`,
      accessToken: valid.access_token,
    }).catch(() => null)
  }

  const message = buildBriefing({ recovery, sleep })

  // 发 Telegram（如果有 chat_id）
  if (!profile?.telegram_chat_id) {
    // 还是把早报记下来，但 status 标记没发
    await supa.from('morning_briefings').insert({
      user_id: userId,
      briefing_date: today,
      recovery_score: recovery.score?.recovery_score,
      sleep_score: sleep?.score?.sleep_performance_percentage,
      hrv: recovery.score?.hrv_rmssd_milli,
      rhr: recovery.score?.resting_heart_rate,
      message_text: message,
      delivery_target: 'none',
    })
    return { user_id: userId, status: 'no-telegram' }
  }

  const tg = await sendTelegram({ chatId: profile.telegram_chat_id, text: message })
  if (!tg.ok) {
    return { user_id: userId, status: 'error', detail: `telegram: ${tg.error}` }
  }

  await supa.from('morning_briefings').insert({
    user_id: userId,
    briefing_date: today,
    recovery_score: recovery.score?.recovery_score,
    sleep_score: sleep?.score?.sleep_performance_percentage,
    hrv: recovery.score?.hrv_rmssd_milli,
    rhr: recovery.score?.resting_heart_rate,
    message_text: message,
    delivery_target: `telegram:${profile.telegram_chat_id}`,
  })

  return { user_id: userId, status: 'sent' }
}

export async function GET(req: Request) {
  // 校验：Vercel cron 会带 x-vercel-cron header，或者手动调用要带 CRON_SECRET
  const isVercelCron = req.headers.get('x-vercel-cron') !== null
  const auth = req.headers.get('authorization')
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`
  if (!isVercelCron && auth !== expectedAuth) {
    return new NextResponse('unauthorized', { status: 401 })
  }

  const supa = admin()
  const { data: tokens, error } = await supa
    .from('whoop_tokens')
    .select('user_id')

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const results = []
  for (const row of tokens ?? []) {
    try {
      const r = await processUser(supa, row.user_id)
      results.push(r)
    } catch (e) {
      results.push({
        user_id: row.user_id,
        status: 'error',
        detail: e instanceof Error ? e.message : 'unknown',
      })
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  })
}
