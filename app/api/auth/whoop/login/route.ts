/**
 * 启动 WHOOP OAuth：
 *   GET /api/auth/whoop/login → 302 跳 WHOOP 授权页
 *   要求当前 Hermes 用户已登录（Supabase auth），否则跳 /login
 *   state 用 user_id + 随机数防 CSRF
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildAuthorizeUrl } from '@/lib/whoop/client'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const csrf = randomBytes(16).toString('hex')
  const state = `${user.id}.${csrf}`

  // 把 csrf 存 httpOnly cookie，callback 时校验
  const cookieStore = await cookies()
  cookieStore.set('whoop_oauth_csrf', csrf, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/auth/whoop',
    maxAge: 600,
  })

  const origin = new URL(request.url).origin
  const url = buildAuthorizeUrl({
    clientId: process.env.WHOOP_CLIENT_ID!,
    redirectUri: `${origin}/api/auth/whoop/callback`,
    state,
  })

  return NextResponse.redirect(url)
}
