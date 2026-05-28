import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSrv } from '@/lib/supabase/server'
import { requestEvolution } from '@/lib/pet-actions.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (!body?.user_pet_id) {
    return NextResponse.json({ error: 'missing user_pet_id' }, { status: 400 })
  }
  const r = await requestEvolution(user.id, body.user_pet_id)
  if (!r.ok) return NextResponse.json({ error: r.error, need: r.need ?? null }, { status: r.code ?? 400 })
  return NextResponse.json({ ok: true, target: r.target })
}
