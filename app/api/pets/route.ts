/**
 * GET  /api/pets   → 列出当前用户的全部宠物
 * PATCH /api/pets  → 切换宠物 is_active（出战 / 收回），body: { user_pet_id, active }
 *
 * 鉴权：getRouteUser —— 原生 App 用 Authorization: Bearer <JWT>，Web 回退 cookie；
 * 二者 RLS 等价（都按 user_id 隔离）。仅 App 调用的用户路由附 CORS。
 */
import { NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/supabase/route-auth'
import { preflight, withCors } from '@/lib/http/cors'
import { setPetActive } from '@/lib/pets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { supabase: supa, user } = await getRouteUser(req)
  if (!user) return withCors(req, new NextResponse('unauthorized', { status: 401 }))

  const { data, error } = await supa
    .from('user_pets')
    .select('*')
    .eq('user_id', user.id)
    .order('caught_at', { ascending: false })

  if (error) {
    return withCors(req, NextResponse.json({ error: error.message }, { status: 500 }))
  }

  return withCors(req, NextResponse.json({
    pets: data ?? [],
    active_count: (data ?? []).filter((p: any) => p.is_active).length,
    max_active: 3,
  }))
}

export async function PATCH(req: Request) {
  const { user } = await getRouteUser(req)
  if (!user) return withCors(req, new NextResponse('unauthorized', { status: 401 }))

  const body = await req.json().catch(() => null)
  if (!body || typeof body.user_pet_id !== 'string' || typeof body.active !== 'boolean') {
    return withCors(req, NextResponse.json(
      { error: 'body 需要 { user_pet_id: string, active: boolean }' },
      { status: 400 }
    ))
  }

  // 业务规则在 setPetActive：检查 PET_SLOT_FULL（>= 3 active 时阻止上场）
  const result = await setPetActive(user.id, body.user_pet_id, body.active)
  if (!result.ok) {
    const code = result.error === 'PET_SLOT_FULL' ? 409 : 400
    return withCors(req, NextResponse.json({ error: result.error }, { status: code }))
  }

  return withCors(req, NextResponse.json({ ok: true }))
}

export function OPTIONS(req: Request) {
  return preflight(req)
}
