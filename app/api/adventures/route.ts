/**
 * GET /api/adventures            → 列出当前用户全部冒险（按 started_at 降序）
 * GET /api/adventures?id=<uuid>  → 取单条冒险详情（含 chapters / scene_tier 等新字段）
 *
 * 鉴权：getRouteUser（Bearer / cookie 等价 RLS）。仅 App 用户路由附 CORS。
 */
import { NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/supabase/route-auth'
import { preflight, withCors } from '@/lib/http/cors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT_FULL =
  'id, started_at, completed_at, scene_type, scene_tier, rarity_tier, stamina_used, duration_min, chapters, triggered_by, story_md, scene_image_url, pets_dispatched, rewards, pet_encounter, status'

export async function GET(request: Request) {
  const { supabase: supa, user } = await getRouteUser(request)
  if (!user) return withCors(request, new NextResponse('unauthorized', { status: 401 }))

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (id) {
    const { data, error } = await supa
      .from('adventures')
      .select(SELECT_FULL)
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle()

    if (error) return withCors(request, NextResponse.json({ error: error.message }, { status: 500 }))
    if (!data) return withCors(request, NextResponse.json({ error: 'not_found' }, { status: 404 }))
    return withCors(request, NextResponse.json({ adventure: data }))
  }

  const { data, error } = await supa
    .from('adventures')
    .select(SELECT_FULL)
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(100)

  if (error) return withCors(request, NextResponse.json({ error: error.message }, { status: 500 }))
  return withCors(request, NextResponse.json({ adventures: data ?? [] }))
}

export function OPTIONS(req: Request) {
  return preflight(req)
}
