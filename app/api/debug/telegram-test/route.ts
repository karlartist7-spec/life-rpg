/**
 * 临时调试端点：直接发一条测试 Telegram 消息。
 * 上线后会删掉。带 CRON_SECRET 鉴权。
 */
import { NextResponse } from 'next/server'
import { sendTelegram } from '@/lib/telegram/sender'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 })
  }

  const url = new URL(req.url)
  const chatId = url.searchParams.get('chat_id') ?? '1896951664'
  const text = url.searchParams.get('text') ?? '🧪 life-rpg test — Vercel→Telegram alive'

  const r = await sendTelegram({ chatId, text })
  return NextResponse.json(r)
}
