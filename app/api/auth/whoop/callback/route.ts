/**
 * WHOOP OAuth callback：
 *   1. 校验 state CSRF
 *   2. code → token
 *   3. 拿 whoop profile 拿 whoop_user_id
 *   4. 存 tokens 到 whoop_tokens
 *   5. 跳回 dashboard
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForToken, getProfile } from '@/lib/whoop/client'
import { saveTokens } from '@/lib/whoop/tokens'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errParam = url.searchParams.get('error')

  if (errParam) {
    return NextResponse.redirect(
      new URL(`/dashboard?whoop_error=${encodeURIComponent(errParam)}`, request.url)
    )
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL('/dashboard?whoop_error=missing_params', request.url))
  }

  // 校验 CSRF
  const [stateUserId, stateCsrf] = state.split('.')
  const cookieStore = await cookies()
  const csrfCookie = cookieStore.get('whoop_oauth_csrf')?.value
  if (!csrfCookie || csrfCookie !== stateCsrf) {
    return NextResponse.redirect(new URL('/dashboard?whoop_error=csrf', request.url))
  }

  // 校验 logged-in 用户匹配
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== stateUserId) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const token = await exchangeCodeForToken({
      code,
      clientId: process.env.WHOOP_CLIENT_ID!,
      clientSecret: process.env.WHOOP_CLIENT_SECRET!,
      redirectUri: `${url.origin}/api/auth/whoop/callback`,
    })

    const profile = await getProfile(token.access_token)

    await saveTokens({
      user_id: user.id,
      whoop_user_id: profile.user_id,
      token,
    })

    // 清掉 csrf cookie
    cookieStore.delete('whoop_oauth_csrf')

    return NextResponse.redirect(new URL('/dashboard?whoop=connected', request.url))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    return NextResponse.redirect(
      new URL(`/dashboard?whoop_error=${encodeURIComponent(msg).slice(0, 200)}`, request.url)
    )
  }
}
