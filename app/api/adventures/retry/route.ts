/**
 * POST /api/adventures/retry  — 用户重试卡住/失败的冒险
 *
 * Body: { adventure_id: string }
 * 登录鉴权（非 CRON）。把属于当前用户的 failed（或仍 pending）冒险重置回正确的
 * pending 状态并清零 render_attempts，让 GitHub Actions worker 下次 cron 重新接管。
 * RLS（adventures_update_own）保证只能改自己的。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSrv } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = body?.adventure_id
  if (!id) return NextResponse.json({ error: 'missing adventure_id' }, { status: 400 })

  const { data: adv } = await supa
    .from('adventures')
    .select('id, status, story_md')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!adv) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  if (adv.status === 'completed') return NextResponse.json({ error: 'ALREADY_COMPLETED' }, { status: 409 })

  // 有故事就只缺图 → pending_image；否则从头 → pending_story
  const next = adv.story_md ? 'pending_image' : 'pending_story'
  const { error } = await supa
    .from('adventures')
    .update({ status: next, render_attempts: 0 })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, status: next })
}
