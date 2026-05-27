/**
 * GET /api/inventory → 列出当前用户的全部物品（join items 元数据）
 * RLS 由 server-side supabase client 隔离 user_id。
 */
import { NextResponse } from 'next/server'
import { createClient as createSrv } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supa = await createSrv()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })

  // 1. 取用户库存（按 acquired_at 倒序，新拿到的在前）
  const { data: inv, error } = await supa
    .from('user_inventory')
    .select('id, item_slug, qty, equipped, acquired_adventure_id, acquired_at')
    .eq('user_id', user.id)
    .order('acquired_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 2. 批量取 items 元数据
  const slugs = Array.from(new Set((inv ?? []).map((r) => r.item_slug)))
  let metaMap: Record<string, any> = {}
  if (slugs.length) {
    const { data: items } = await supa
      .from('items')
      .select('slug, name, description, type, rarity, image_url, metadata')
      .in('slug', slugs)
    metaMap = (items ?? []).reduce((m, it) => {
      m[it.slug] = it
      return m
    }, {} as Record<string, any>)
  }

  // 3. 合并
  const merged = (inv ?? []).map((row) => ({
    ...row,
    meta: metaMap[row.item_slug] ?? {
      slug: row.item_slug,
      name: row.item_slug,
      type: 'unknown',
      rarity: 'common',
      description: null,
      image_url: null,
    },
  }))

  // 4. 类型统计
  const byType: Record<string, number> = {}
  const byRarity: Record<string, number> = {}
  for (const row of merged) {
    byType[row.meta.type] = (byType[row.meta.type] ?? 0) + row.qty
    byRarity[row.meta.rarity] = (byRarity[row.meta.rarity] ?? 0) + row.qty
  }

  return NextResponse.json({
    items: merged,
    stats: {
      total_qty: merged.reduce((s, r) => s + r.qty, 0),
      unique_count: merged.length,
      by_type: byType,
      by_rarity: byRarity,
    },
  })
}
