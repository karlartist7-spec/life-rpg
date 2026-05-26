/**
 * WHOOP webhook 接收端点。
 *
 * WHOOP 文档约定：
 *   - Header X-WHOOP-Signature: base64(HMAC_SHA256(secret, timestamp + raw_body))
 *   - Header X-WHOOP-Signature-Timestamp: unix ms
 *   - 5 秒内必须回 200
 *
 * 事件类型 (event type)：
 *   - workout.updated, sleep.updated, recovery.updated, cycle.updated
 *   - workout.deleted, sleep.deleted, recovery.deleted, cycle.deleted
 *   - user.profile.updated
 *
 * Payload:
 *   { user_id: number, id: number|string, type: string, trace_id?: string }
 *
 * 我们这里只做：验签 → 写 events 表（包含 raw payload），不实时拉详情。
 * 详细数据由后续的 cron / 主动拉取再用 WHOOP API 取，避免 webhook 超时。
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'

export const runtime = 'nodejs' // 需要 node crypto
export const dynamic = 'force-dynamic'

function verifySignature(opts: {
  rawBody: string
  signature: string | null
  timestamp: string | null
  secret: string
}): boolean {
  if (!opts.signature || !opts.timestamp) return false
  // 5 分钟 replay window
  const tsMs = parseInt(opts.timestamp, 10)
  if (!Number.isFinite(tsMs)) return false
  if (Math.abs(Date.now() - tsMs) > 5 * 60_000) return false

  const expected = createHmac('sha256', opts.secret)
    .update(opts.timestamp + opts.rawBody)
    .digest('base64')

  // timingSafeEqual 需要 buffer 长度一致
  const a = Buffer.from(expected)
  const b = Buffer.from(opts.signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  const sig = req.headers.get('x-whoop-signature')
  const ts = req.headers.get('x-whoop-signature-timestamp')

  if (!verifySignature({
    rawBody,
    signature: sig,
    timestamp: ts,
    secret: process.env.WHOOP_WEBHOOK_SECRET!,
  })) {
    return new NextResponse('invalid signature', { status: 401 })
  }

  let payload: {
    user_id: number
    id: number | string
    type: string
    trace_id?: string
  }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new NextResponse('bad json', { status: 400 })
  }

  const supa = adminClient()

  // 反查 user_id (whoop_user_id 在 schema 里是 text，统一转成 string)
  const whoopUserIdStr = String(payload.user_id)
  const { data: tokenRow } = await supa
    .from('whoop_tokens')
    .select('user_id')
    .eq('whoop_user_id', whoopUserIdStr)
    .single()

  if (!tokenRow) {
    // 未绑定的 whoop_user_id —— 仍然 200 应答 WHOOP 不再重投
    console.warn('[whoop-webhook] no user bound for whoop_user_id', whoopUserIdStr)
    return NextResponse.json({ ok: true, note: 'no-user-bound' })
  }

  // 事件类型映射：'workout.updated' / 'sleep.updated' / 'recovery.updated' / 'cycle.updated' / 'user.profile.updated'
  // 取点前面那截作为 type（schema 里 type 是 sleep/recovery/workout 这种）
  const typeBase = payload.type.split('.')[0] // 'workout' / 'sleep' / 'recovery' / 'cycle' / 'user'

  const dedupe_key = `whoop:${payload.type}:${payload.id}:${ts ?? ''}`

  const { error } = await supa.from('events').insert({
    user_id: tokenRow.user_id,
    type: typeBase,
    source: 'whoop',
    payload: { ...payload, raw_event_type: payload.type },
    occurred_at: ts ? new Date(parseInt(ts, 10)).toISOString() : new Date().toISOString(),
    dedupe_key,
  })

  // 23505 = unique violation = 重复 webhook，吃掉
  if (error && error.code !== '23505') {
    console.error('[whoop-webhook] insert error', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// 文档建议 webhook URL 也支持 GET 做健康检查
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'whoop-webhook',
    expects: 'POST with X-WHOOP-Signature + X-WHOOP-Signature-Timestamp',
  })
}
