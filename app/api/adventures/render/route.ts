/**
 * POST /api/adventures/render
 *
 * 独立渲染端点 — 兜底重试场景：
 *   - waitUntil 失败时 cron 重试
 *   - 前端"重新生图"按钮
 *   - status='pending_image' 的旧 adventure 补图
 *
 * Body: { adventure_id: string }
 * 需 CRON_SECRET 鉴权。
 */

import { NextRequest, NextResponse } from 'next/server'
import { renderAdventureImages } from '@/lib/adventures'

export const runtime = 'nodejs'
export const maxDuration = 300 // 烧图最长 5min（Vercel Pro 才 300，Hobby 只 60，但 waitUntil 触发的不算这个）

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

  const adventureId = body.adventure_id
  if (!adventureId) {
    return NextResponse.json({ ok: false, error: 'missing adventure_id' }, { status: 400 })
  }

  try {
    const result = await renderAdventureImages(adventureId)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    console.error('[adventures/render] error:', e)
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    )
  }
}
