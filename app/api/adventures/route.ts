/**
 * GET /api/adventures → 列出当前用户全部冒险（按 started_at 降序）
 * 走 server-side supabase client，RLS 自动隔离 user_id。
 */
import { NextResponse } from 'next/server'
import { createClient as createSrv } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })

  const { data, error } = await supa
    .from('adventures')
    .select('id, started_at, completed_at, scene_type, story_md, scene_image_url, pets_dispatched, rewards, pet_encounter, status')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ adventures: data ?? [] })
}
