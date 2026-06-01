import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * 解析请求用户：优先 Authorization: Bearer <supabase JWT>（原生 App），
 * 否则回退 cookie session（Web）。返回的 supabase client 都带该用户身份，RLS 等价。
 */
export async function getRouteUser(
  req: Request
): Promise<{ supabase: SupabaseClient; user: User | null }> {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7)
    const supabase = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data } = await supabase.auth.getUser(token)
    return { supabase, user: data.user ?? null }
  }
  // cookie 回退（与 lib/supabase/server.ts 一致）
  const cookieStore = await cookies()
  const supabase = createServerClient(URL, ANON, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
      },
    },
  })
  const { data } = await supabase.auth.getUser()
  return { supabase, user: data.user ?? null }
}
