/**
 * GET /api/whoop/status
 *
 * 返回当前用户的 WHOOP 连接状态、token 是否过期、最近一次 event 时间。
 */
import { NextResponse } from 'next/server'
import { createClient as createSrv } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })

  const { data: token } = await supa
    .from('whoop_tokens')
    .select('whoop_user_id, expires_at, scope, updated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: lastEvent } = await supa
    .from('events')
    .select('type, occurred_at')
    .eq('user_id', user.id)
    .like('type', 'whoop.%')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    connected: !!token,
    whoop_user_id: token?.whoop_user_id ?? null,
    expires_at: token?.expires_at ?? null,
    expired: token ? new Date(token.expires_at).getTime() < Date.now() : null,
    scope: token?.scope ?? null,
    last_event: lastEvent ?? null,
  })
}
