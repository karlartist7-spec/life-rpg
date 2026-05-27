/**
 * GET  /api/pets         → 列出当前用户的全部宠物
 * PATCH /api/pets        → 切换宠物 is_active（出战 / 收回），body: { user_pet_id, active }
 *
 * 都走 supabase server client（基于用户 session），所以 RLS 自动隔离 user_id。
 */
import { NextResponse } from 'next/server'
import { createClient as createSrv } from '@/lib/supabase/server'
import { setPetActive } from '@/lib/pets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })

  const { data, error } = await supa
    .from('user_pets')
    .select('*')
    .eq('user_id', user.id)
    .order('caught_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    pets: data ?? [],
    active_count: (data ?? []).filter((p: any) => p.is_active).length,
    max_active: 3,
  })
}

export async function PATCH(req: Request) {
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body.user_pet_id !== 'string' || typeof body.active !== 'boolean') {
    return NextResponse.json(
      { error: 'body 需要 { user_pet_id: string, active: boolean }' },
      { status: 400 }
    )
  }

  // 业务规则在 setPetActive：检查 PET_SLOT_FULL（>= 3 active 时阻止上场）
  const result = await setPetActive(user.id, body.user_pet_id, body.active)
  if (!result.ok) {
    const code = result.error === 'PET_SLOT_FULL' ? 409 : 400
    return NextResponse.json({ error: result.error }, { status: code })
  }

  return NextResponse.json({ ok: true })
}
