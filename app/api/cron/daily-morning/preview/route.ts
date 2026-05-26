/**
 * Preview endpoint - 预览指定日期的早报内容（不发 TG，不写 DB）
 * GET /api/cron/daily-morning/preview?date=2026-05-26
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculateHealthScore } from '@/lib/health-scoring'
import { fetchDayDataRange } from '@/lib/health-data-fetch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 })
  }
  const u = new URL(req.url)
  const date = u.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const supa = admin()
  const { data: tokens } = await supa.from('whoop_tokens').select('user_id').limit(1)
  const userId = tokens?.[0]?.user_id
  if (!userId) return NextResponse.json({ error: 'no user' }, { status: 404 })

  const tz = 'Asia/Shanghai'
  const days14 = await fetchDayDataRange(supa, userId, date, 14, tz)
  const todayDay = days14.find((d) => d.date === date)
  if (!todayDay) return NextResponse.json({ error: 'no data for date', days_found: days14.map((d) => d.date) }, { status: 404 })

  const last14ExclToday = days14.filter((d) => d.date !== date)
  const health = calculateHealthScore(todayDay, last14ExclToday, 8)

  return NextResponse.json({
    date,
    days_in_range: days14.length,
    today_raw: todayDay,
    health,
  })
}
