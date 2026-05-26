/**
 * WHOOP token 存储 + 自动续期 (server-side, 用 service-role 写 whoop_tokens 表).
 * Refresh token 是 single-use 轮换，每次续期必须把新 refresh_token 写回去。
 */
import { createClient } from '@supabase/supabase-js'
import { refreshAccessToken, type WhoopTokenResponse } from './client'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export type StoredWhoopTokens = {
  user_id: string
  whoop_user_id: string
  access_token: string
  refresh_token: string
  expires_at: string // ISO timestamp
  scope: string | null
}

export async function saveTokens(opts: {
  user_id: string
  whoop_user_id: number | string
  token: WhoopTokenResponse
}): Promise<void> {
  const supa = adminClient()
  const expires_at = new Date(Date.now() + opts.token.expires_in * 1000).toISOString()

  const { error } = await supa.from('whoop_tokens').upsert(
    {
      user_id: opts.user_id,
      whoop_user_id: String(opts.whoop_user_id),
      access_token: opts.token.access_token,
      refresh_token: opts.token.refresh_token,
      expires_at,
      scope: opts.token.scope ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
  if (error) throw error
}

/**
 * 拿当前用户的可用 access_token。如果快过期或已过期，自动 refresh + 持久化新 refresh_token。
 * 60 秒 buffer。
 */
export async function getValidAccessToken(user_id: string): Promise<{
  access_token: string
  whoop_user_id: string
}> {
  const supa = adminClient()
  const { data, error } = await supa
    .from('whoop_tokens')
    .select('*')
    .eq('user_id', user_id)
    .single()

  if (error || !data) throw new Error(`No WHOOP tokens for user ${user_id}`)

  const expiresAt = new Date(data.expires_at).getTime()
  const now = Date.now()

  if (expiresAt - now > 60_000) {
    return { access_token: data.access_token, whoop_user_id: data.whoop_user_id }
  }

  // refresh
  const fresh = await refreshAccessToken({
    refreshToken: data.refresh_token,
    clientId: process.env.WHOOP_CLIENT_ID!,
    clientSecret: process.env.WHOOP_CLIENT_SECRET!,
  })

  await saveTokens({
    user_id,
    whoop_user_id: data.whoop_user_id,
    token: fresh,
  })

  return { access_token: fresh.access_token, whoop_user_id: data.whoop_user_id }
}

/** Webhook 用：根据 whoop_user_id 反查 user_id + access_token */
export async function getTokensByWhoopUserId(whoop_user_id: number | string): Promise<{
  user_id: string
  access_token: string
} | null> {
  const supa = adminClient()
  const { data, error } = await supa
    .from('whoop_tokens')
    .select('user_id')
    .eq('whoop_user_id', String(whoop_user_id))
    .single()
  if (error || !data) return null

  const valid = await getValidAccessToken(data.user_id)
  return { user_id: data.user_id, access_token: valid.access_token }
}
