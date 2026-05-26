/**
 * POST /api/admin/backfill
 *
 * 回填近 N 天 WHOOP 数据 + 逐日结算。
 * 用法：
 *   curl -X POST https://life-rpg-steel.vercel.app/api/admin/backfill \
 *     -H "Authorization: Bearer <CRON_SECRET>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"days": 30}'
 *
 * - 默认 30 天
 * - 跑所有有 whoop_tokens 的用户
 * - 同步 WHOOP → events，再 settleDay 每一天
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncWhoopRange } from '@/lib/whoop/sync'
import { backfillRange } from '@/lib/settlement'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const days = Number(body.days ?? 30)
  const onlyUserId = body.user_id as string | undefined

  const supa = admin()
  let q = supa.from('whoop_tokens').select('user_id')
  if (onlyUserId) q = q.eq('user_id', onlyUserId)
  const { data: tokens, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const results: any[] = []
  for (const t of tokens ?? []) {
    try {
      const { data: profile } = await supa
        .from('profiles')
        .select('timezone')
        .eq('id', t.user_id)
        .single()
      const tz = profile?.timezone ?? 'Asia/Shanghai'

      // 1. 同步 WHOOP
      const sync = await syncWhoopRange({ userId: t.user_id, days })

      // 2. 逐日结算
      const settle = await backfillRange({ userId: t.user_id, days, timezone: tz })

      results.push({
        user_id: t.user_id,
        sync,
        settle_summary: {
          total: settle.length,
          settled: settle.filter((s) => !s.skipped).length,
          skipped: settle.filter((s) => s.skipped).length,
          leveled_up: settle.filter((s) => s.leveledUp).length,
          unlocked: settle.flatMap((s) => s.unlockedAchievements ?? []),
        },
        days: settle,
      })
    } catch (e: any) {
      results.push({ user_id: t.user_id, error: e?.message ?? String(e) })
    }
  }

  return NextResponse.json({ ok: true, days, results })
}
