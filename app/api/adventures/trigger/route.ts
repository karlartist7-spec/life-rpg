/**
 * POST /api/adventures/trigger
 *
 * 阶段 1：LLM 故事 + 章节 + 写 DB（~10s，pending）
 * 阶段 2：GitHub Actions cron worker 烧图（不在这个路由）
 *
 * 触发路径：
 *   - WHOOP webhook 收到 recovery.updated → fan-out 调本路由（自动）
 *   - 手动 POST（开发测试）
 *
 * Body:
 *   { user_id?: string, trigger_event_id?: string, triggered_by?: 'sleep_recovery'|'manual', force?: boolean }
 *
 * 同日幂等：当日已有冒险 → 返回 409 already-exists（除非 force=true）
 *
 * 需 CRON_SECRET 鉴权。
 */

import { NextRequest, NextResponse } from 'next/server'
import { bootstrapPendingAdventure } from '@/lib/adventures'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_SRV = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function sb<T = unknown>(path: string): Promise<T> {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPA_SRV,
      Authorization: `Bearer ${SUPA_SRV}`,
    },
  })
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`)
  return r.json() as Promise<T>
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: {
    user_id?: string
    trigger_event_id?: string
    triggered_by?: 'sleep_recovery' | 'manual'
    force?: boolean
  } = {}
  try {
    body = await req.json()
  } catch {}

  const userId = body.user_id || process.env.DEFAULT_USER_ID
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'missing user_id' }, { status: 400 })
  }

  // 同日幂等：UTC+8 当日有未完成或已完成的冒险都跳过（防 webhook 重投）
  if (!body.force) {
    const todayCN = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
    const existing = await sb<Array<{ id: string; status: string }>>(
      `adventures?user_id=eq.${userId}&started_at=gte.${todayCN}T00:00:00%2B08:00&select=id,status&limit=1`,
    )
    if (existing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'already-exists-today',
          adventure_id: existing[0].id,
          status: existing[0].status,
          note: '今日已有冒险，传 force=true 强制再跑',
        },
        { status: 409 },
      )
    }
  }

  try {
    const result = await bootstrapPendingAdventure({
      userId,
      triggerEventId: body.trigger_event_id,
      triggeredBy: body.triggered_by || (body.trigger_event_id ? 'sleep_recovery' : 'manual'),
    })

    return NextResponse.json({
      ok: true,
      adventure: result,
      note: 'Skeleton written. GitHub Actions worker will fill chapters + render images.',
    })
  } catch (e) {
    const err = e as Error
    console.error('[adventures/trigger] error:', err)
    return NextResponse.json(
      { ok: false, error: err.message || String(err), stack: err.stack?.split('\n').slice(0, 5) },
      { status: 500 },
    )
  }
}
