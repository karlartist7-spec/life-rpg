/**
 * GET /api/adventures            → 列出当前用户全部冒险（按 started_at 降序）
 * GET /api/adventures?id=<uuid>  → 取单条冒险详情（含 chapters / scene_tier 等新字段）
 *
 * 走 server-side supabase client，RLS 自动隔离 user_id。
 */
import { NextResponse } from 'next/server'
import { createClient as createSrv } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT_FULL =
  'id, started_at, completed_at, scene_type, scene_tier, rarity_tier, stamina_used, duration_min, chapters, triggered_by, story_md, scene_image_url, pets_dispatched, rewards, pet_encounter, status'

export async function GET(request: Request) {
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (id) {
    const { data, error } = await supa
      .from('adventures')
      .select(SELECT_FULL)
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ adventure: data })
  }

  const { data, error } = await supa
    .from('adventures')
    .select(SELECT_FULL)
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ adventures: data ?? [] })
}
