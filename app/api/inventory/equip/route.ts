import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSrv } from '@/lib/supabase/server'
import { equipItem } from '@/lib/pet-actions.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body?.item_id || typeof body.equipped !== 'boolean') {
    return NextResponse.json({ error: 'need { item_id, equipped }' }, { status: 400 })
  }
  const r = await equipItem(user.id, body.item_id, body.equipped)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.code ?? 400 })
  return NextResponse.json(r)
}
