// 临时 debug — 看 Vercel runtime 拿到的 env shape。用完立删！
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const dump = (k: string) => {
    const v = process.env[k]
    return v ? { len: v.length, prefix: v.slice(0, 8), suffix: v.slice(-4) } : null
  }

  return NextResponse.json({
    OPENAI_API_KEY: dump('OPENAI_API_KEY'),
    NEXT_PUBLIC_SUPABASE_URL: dump('NEXT_PUBLIC_SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: dump('SUPABASE_SERVICE_ROLE_KEY'),
    CRON_SECRET: dump('CRON_SECRET'),
    WHOOP_CLIENT_SECRET: dump('WHOOP_CLIENT_SECRET'),
    node_version: process.version,
    vercel_region: process.env.VERCEL_REGION,
  })
}
