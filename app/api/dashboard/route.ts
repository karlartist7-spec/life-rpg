/**
 * GET /api/dashboard
 *
 * 首页一站式聚合接口，返回 spec §8.4 所有数据：
 * - 用户信息
 * - 角色信息（Hermes / Lv / EXP / 称号）
 * - 今日 snapshot (recovery/sleep/strain/streak)
 * - 五维属性 + 7 天 sparkline
 * - 今日任务进度
 * - 冒险日志（最近 5 条）
 * - 成就墙
 * - 30 天 EXP 趋势
 * - 连接状态 (whoop / github / telegram)
 */
import { NextResponse } from 'next/server'
import { createClient as createSrv } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isoDateInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export async function GET() {
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })

  // 1. profile
  const { data: profile } = await supa
    .from('profiles')
    .select('display_name, avatar_url, timezone, telegram_chat_id')
    .eq('id', user.id)
    .single()
  const tz = profile?.timezone ?? 'Asia/Shanghai'
  const today = isoDateInTz(new Date(), tz)
  const yesterday = isoDateInTz(new Date(Date.now() - 86400_000), tz)

  // 2. character
  const { data: cs } = await supa
    .from('character_state')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const nextLevelExp = cs ? 1000 + cs.level * 120 : 1000

  // 3. WHOOP 连接状态
  const { data: wtok } = await supa
    .from('whoop_tokens')
    .select('whoop_user_id, expires_at, updated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  // 4. 今日 + 昨日 settlement (snapshot)
  const { data: dsRows } = await supa
    .from('daily_settlements')
    .select('*')
    .eq('user_id', user.id)
    .in('date', [today, yesterday])
  const ds = (dsRows ?? []).reduce(
    (m, r) => { m[r.date] = r; return m },
    {} as Record<string, any>
  )
  const todayDS = ds[today] ?? null
  const yestDS = ds[yesterday] ?? null

  // 5. 7 天 attribute 趋势 (从 daily_settlements 推累计)
  const { data: last7 } = await supa
    .from('daily_settlements')
    .select('date, vit_gain, spr_gain, int_gain, wil_gain, cha_gain, exp_gained, level_after')
    .eq('user_id', user.id)
    .gte('date', isoDateInTz(new Date(Date.now() - 6 * 86400_000), tz))
    .order('date', { ascending: true })

  // 6. 30 天 EXP 趋势
  const { data: last30 } = await supa
    .from('daily_settlements')
    .select('date, exp_gained, level_after')
    .eq('user_id', user.id)
    .gte('date', isoDateInTz(new Date(Date.now() - 29 * 86400_000), tz))
    .order('date', { ascending: true })

  // 7. 今日 quest 进度
  const { data: quests } = await supa
    .from('quests')
    .select('id, slug, title, description, reward_exp, reward')
    .eq('active', true)
    .eq('scope', 'daily')
  const { data: qp } = await supa
    .from('quest_progress')
    .select('quest_id, status, current_value, target_value, completed_at')
    .eq('user_id', user.id)
    .eq('progress_date', today)
  const qpMap = (qp ?? []).reduce(
    (m, r) => { m[r.quest_id] = r; return m },
    {} as Record<string, any>
  )
  const questsOut = (quests ?? []).map((q) => ({
    ...q,
    progress: qpMap[q.id] ?? { status: 'pending', current_value: 0, target_value: 1 },
  }))

  // 8. adventure log (最近 5)
  const { data: log } = await supa
    .from('adventure_log')
    .select('id, log_date, occurred_at, category, message, exp_delta, attr_delta')
    .eq('user_id', user.id)
    .order('occurred_at', { ascending: false })
    .limit(5)

  // 9. 成就墙
  const { data: achs } = await supa.from('achievements').select('*').eq('active', true)
  const { data: ua } = await supa
    .from('user_achievements')
    .select('achievement_id, status, progress_current, progress_target, unlocked_at')
    .eq('user_id', user.id)
  const uaMap = (ua ?? []).reduce(
    (m, r) => { m[r.achievement_id] = r; return m },
    {} as Record<string, any>
  )
  const achievementsOut = (achs ?? []).map((a) => ({
    ...a,
    progress: uaMap[a.id] ?? { status: 'locked', progress_current: 0, progress_target: 1 },
  }))

  // 10. streak
  const { data: streak } = await supa
    .from('streaks')
    .select('current_count, longest_count, last_check_date')
    .eq('user_id', user.id)
    .eq('streak_type', 'daily_goal')
    .maybeSingle()

  // 11. 称号
  let titleCode = 'rookie'
  if (cs) {
    const attrs = [
      ['vit', cs.vit, 'strain_runner'],
      ['spr', cs.spr, 'recovery_wizard'],
      ['int', cs.int, 'code_knight'],
      ['wil', cs.wil, 'streak_monk'],
      ['cha', cs.cha, 'social_bard'],
    ] as const
    const max = Math.max(...attrs.map((a) => a[1] as number))
    if (max > 50) titleCode = attrs.find((a) => a[1] === max)![2]
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      display_name: profile?.display_name,
      avatar_url: profile?.avatar_url,
      timezone: tz,
    },
    character: cs
      ? {
          name: cs.name ?? 'Hermes',
          title: cs.title,
          title_code: titleCode,
          motto: cs.motto,
          level: cs.level,
          exp: cs.exp,
          total_exp: cs.total_exp,
          next_level_exp: nextLevelExp,
          exp_to_next: nextLevelExp - cs.exp,
        }
      : null,
    today_snapshot: {
      date: today,
      recovery_score: todayDS?.recovery_score ?? null,
      sleep_minutes: todayDS?.sleep_minutes ?? null,
      sleep_performance: todayDS?.sleep_performance ?? null,
      strain: todayDS?.strain ?? null,
      streak: streak?.current_count ?? 0,
      // 昨日对比
      yesterday: {
        recovery_score: yestDS?.recovery_score ?? null,
        sleep_minutes: yestDS?.sleep_minutes ?? null,
        strain: yestDS?.strain ?? null,
      },
    },
    attributes: cs
      ? {
          vit: { value: cs.vit, today_delta: todayDS?.vit_gain ?? 0, color: 'mint',     source: 'WHOOP Recovery/Strain/Workout' },
          spr: { value: cs.spr, today_delta: todayDS?.spr_gain ?? 0, color: 'sky',      source: 'WHOOP Sleep/HRV/Recovery' },
          int: { value: cs.int, today_delta: todayDS?.int_gain ?? 0, color: 'lavender', source: 'GitHub / 阅读' },
          wil: { value: cs.wil, today_delta: todayDS?.wil_gain ?? 0, color: 'lemon',    source: '连击 / 任务完成' },
          cha: { value: cs.cha, today_delta: todayDS?.cha_gain ?? 0, color: 'rose',     source: '社交 / 表达' },
          last7: (last7 ?? []).map((r) => ({
            date: r.date,
            vit: r.vit_gain, spr: r.spr_gain, int: r.int_gain, wil: r.wil_gain, cha: r.cha_gain,
          })),
        }
      : null,
    quests: questsOut,
    adventure_log: log ?? [],
    achievements: achievementsOut,
    exp_trend: (last30 ?? []).map((r) => ({ date: r.date, exp: r.exp_gained, level: r.level_after })),
    connections: {
      whoop: { connected: !!wtok, last_sync: wtok?.updated_at ?? null, expired: wtok ? new Date(wtok.expires_at).getTime() < Date.now() : null },
      github: { connected: false },
      telegram: { connected: !!profile?.telegram_chat_id, chat_id: profile?.telegram_chat_id ?? null },
    },
  })
}
