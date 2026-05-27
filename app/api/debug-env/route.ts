import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const secret = process.env.WHOOP_WEBHOOK_SECRET || '(unset)'
  const cron = process.env.CRON_SECRET || '(unset)'
  return NextResponse.json({
    whoop_webhook_secret_prefix: secret.substring(0, 8),
    whoop_webhook_secret_len: secret.length,
    cron_secret_prefix: cron.substring(0, 8),
    node_env: process.env.NODE_ENV,
  })
}
