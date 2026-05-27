/**
 * POST /api/adventures/trigger
 *
 * 阶段 1：LLM 故事 + 写 DB（~10s，pending）
 * 阶段 2：GitHub Actions cron worker 烧图（不在这个路由）
 *
 * Body: { user_id?: string, recovery_score?: number, strain?: number, hrv?: number }
 * 需 CRON_SECRET 鉴权。
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateStoryAndPet } from '@/lib/adventures'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch {}

  const userId = body.user_id || process.env.DEFAULT_USER_ID
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'missing user_id' }, { status: 400 })
  }

  try {
    const result = await generateStoryAndPet({
      userId,
      triggerEventId: body.trigger_event_id,
      recoveryScore: body.recovery_score ?? 60,
      strain: body.strain,
      hrv: body.hrv,
    })

    return NextResponse.json({
      ok: true,
      adventure: result,
      note: 'Image rendering handled by GitHub Actions worker (cron */5).',
    })
  } catch (e: any) {
    console.error('[adventures/trigger] error:', e)
    return NextResponse.json(
      { ok: false, error: e?.message || String(e), stack: e?.stack?.split('\n').slice(0, 5) },
      { status: 500 }
    )
  }
}
