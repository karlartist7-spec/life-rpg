/**
 * POST /api/adventures/retry — 用户重试卡住/失败的冒险
 *
 * Body: { adventure_id: string }
 * 鉴权：getRouteUser（Bearer / cookie 等价）。把属于当前用户的 failed（或仍 pending）冒险
 * 重置回正确的 pending 状态并清零 render_attempts，让 worker 下次 cron 重新接管。
 * RLS（adventures_update_own）保证只能改自己的。
 */
import { NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/supabase/route-auth'
import { preflight, withCors } from '@/lib/http/cors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { supabase: supa, user } = await getRouteUser(req)
  if (!user) return withCors(req, new NextResponse('unauthorized', { status: 401 }))

  const body = await req.json().catch(() => ({}))
  const id = body?.adventure_id
  if (!id) return withCors(req, NextResponse.json({ error: 'missing adventure_id' }, { status: 400 }))

  const { data: adv } = await supa
    .from('adventures')
    .select('id, status, story_md')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!adv) return withCors(req, NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }))
  if (adv.status === 'completed') return withCors(req, NextResponse.json({ error: 'ALREADY_COMPLETED' }, { status: 409 }))

  // 有故事就只缺图 → pending_image；否则从头 → pending_story
  const next = adv.story_md ? 'pending_image' : 'pending_story'
  const { error } = await supa
    .from('adventures')
    .update({ status: next, render_attempts: 0 })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return withCors(req, NextResponse.json({ error: error.message }, { status: 500 }))

  return withCors(req, NextResponse.json({ ok: true, status: next }))
}

export function OPTIONS(req: Request) {
  return preflight(req)
}
