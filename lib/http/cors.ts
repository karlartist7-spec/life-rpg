import { NextResponse } from 'next/server'

function allowOrigin(req: Request): string {
  const origin = req.headers.get('origin') ?? ''
  const list = (process.env.NATIVE_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  // 原生 fetch 无 Origin → 回退 '*'（无凭据，安全）；Web 同源不发 Origin 也不需要 CORS。
  if (!origin) return '*'
  return list.includes(origin) ? origin : list[0] ?? '*'
}

export function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowOrigin(req),
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
  }
}

/** OPTIONS 预检。 */
export function preflight(req: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

/** 给一个 NextResponse 附上 CORS 头并返回它。 */
export function withCors(req: Request, res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(corsHeaders(req))) res.headers.set(k, v)
  return res
}
