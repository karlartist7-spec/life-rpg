/**
 * Debug: 看 server 看到的 session 状态 + cookies.
 * 用完会删。
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll().map(c => ({
    name: c.name,
    value_len: c.value.length,
    value_preview: c.value.slice(0, 40),
  }))

  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  return NextResponse.json({
    user: user ? { id: user.id, email: user.email } : null,
    error: error ? { message: error.message, status: error.status } : null,
    cookies_count: allCookies.length,
    cookies: allCookies,
  })
}
