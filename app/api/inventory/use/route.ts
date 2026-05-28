import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSrv } from '@/lib/supabase/server'
import { consumeItem } from '@/lib/pet-actions.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body?.item_id) return NextResponse.json({ error: 'missing item_id' }, { status: 400 })
  const r = await consumeItem(user.id, body.item_id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.code ?? 400 })
  return NextResponse.json(r)
}
