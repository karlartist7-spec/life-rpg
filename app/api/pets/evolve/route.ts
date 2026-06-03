import { NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/supabase/route-auth'
import { preflight, withCors } from '@/lib/http/cors'
import { requestEvolution } from '@/lib/pet-actions.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { user } = await getRouteUser(req)
  if (!user) return withCors(req, new NextResponse('unauthorized', { status: 401 }))

  const body = await req.json().catch(() => ({}))
  if (!body?.user_pet_id) {
    return withCors(req, NextResponse.json({ error: 'missing user_pet_id' }, { status: 400 }))
  }
  const r = await requestEvolution(user.id, body.user_pet_id)
  if (!r.ok) return withCors(req, NextResponse.json({ error: r.error, need: r.need ?? null }, { status: r.code ?? 400 }))
  return withCors(req, NextResponse.json({ ok: true, target: r.target }))
}

export function OPTIONS(req: Request) {
  return preflight(req)
}
