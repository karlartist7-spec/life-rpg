/**
 * POST /api/adventures/trigger
 *
 * 两阶段触发：
 *   1. 立即返回（LLM 故事 + 写 DB，~10s）
 *   2. waitUntil 异步烧图（~3min，不阻塞响应）
 *
 * Body: { user_id?: string, recovery_score?: number, strain?: number, hrv?: number }
 * 需 CRON_SECRET 鉴权。
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { generateStoryAndPet, renderAdventureImages } from '@/lib/adventures'

export const runtime = 'nodejs'
export const maxDuration = 60 // 阶段 1 只需 10s，留 60s buffer

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
    // 阶段 1：LLM + DB（快速返回）
    const result = await generateStoryAndPet({
      userId,
      triggerEventId: body.trigger_event_id,
      recoveryScore: body.recovery_score ?? 60,
      strain: body.strain,
      hrv: body.hrv,
    })

    // 阶段 2：异步烧图（Next.js after() API，不阻塞响应）
    after(async () => {
      try {
        await renderAdventureImages(result.adventureId)
        console.log(`[adventures] 图片渲染完成: ${result.adventureId}`)
      } catch (e: any) {
        console.error(`[adventures] 图片渲染失败 ${result.adventureId}:`, e?.message)
      }
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
