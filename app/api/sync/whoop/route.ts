/**
 * POST /api/sync/whoop
 *
 * 用户手动同步（前端按钮触发）。默认拉最近 7 天，仅同步当前登录用户。
 */
import { NextResponse } from 'next/server'
import { createClient as createSrv } from '@/lib/supabase/server'
import { syncWhoopRange } from '@/lib/whoop/sync'
import { settleDay } from '@/lib/settlement'
import { applyStatsToCharacter } from '@/lib/stats'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isoDateInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export async function POST(req: Request) {
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({}))
  const days = Math.min(Number(body.days ?? 7), 30)

  const { data: profile } = await supa
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single()
  const tz = profile?.timezone ?? 'Asia/Shanghai'

  // 同步
  const sync = await syncWhoopRange({ userId: user.id, days })

  // 结算今天 + 昨天（前端按钮一般只关心最近）
  const today = new Date()
  const dates = [
    isoDateInTz(today, tz),
    isoDateInTz(new Date(today.getTime() - 86400_000), tz),
  ]
  const settle = []
  for (const date of dates) {
    settle.push(await settleDay({ userId: user.id, date, timezone: tz }))
  }

  // 结算后刷新三维 + 当日体力（force：手动同步即时反映到 dashboard）
  const stats = await applyStatsToCharacter(user.id, { force: true, date: dates[0] }).catch(
    (e) => ({ applied: false, reason: e?.message }) as const
  )

  return NextResponse.json({ ok: true, sync, settle, stats })
}
