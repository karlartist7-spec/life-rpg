/**
 * POST /api/adventures/trigger
 *
 * 手动触发一次冒险（debug / 测试用，生产应由 webhook 触发）
 * Body: { user_id?: string, recovery_score?: number, strain?: number, hrv?: number }
 *
 * 需 CRON_SECRET 鉴权（沿用现有约定）。
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateAdventure } from '@/lib/adventures'

export const runtime = 'nodejs'
export const maxDuration = 300 // gpt-image-2 可能要 1-2 分钟

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (auth !== expected) {
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
    const result = await generateAdventure({
      userId,
      triggerEventId: body.trigger_event_id,
      recoveryScore: body.recovery_score ?? 60,
      strain: body.strain,
      hrv: body.hrv,
    })
    return NextResponse.json({ ok: true, adventure: result })
  } catch (e: any) {
    console.error('[adventures/trigger] error:', e)
    return NextResponse.json(
      { ok: false, error: e?.message || String(e), stack: e?.stack },
      { status: 500 }
    )
  }
}
