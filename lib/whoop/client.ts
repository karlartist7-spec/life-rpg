/**
 * WHOOP API client + OAuth helpers.
 *
 * 关键陷阱：
 * 1. refresh token 请求的 `scope` 字段必须是 'offline' 单值，不能传完整列表，否则 400
 * 2. refresh token 是 single-use 自动轮换，必须存新返回的 refresh_token
 * 3. WHOOP API base 是 https://api.prod.whoop.com/developer，全 v2 endpoint
 */

export const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
export const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
export const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer'

export const WHOOP_SCOPES = [
  'offline',
  'read:recovery',
  'read:cycles',
  'read:sleep',
  'read:workout',
  'read:profile',
  'read:body_measurement',
].join(' ')

export type WhoopTokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
  token_type: string
}

/** 生成 WHOOP OAuth 授权 URL */
export function buildAuthorizeUrl(opts: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: WHOOP_SCOPES,
    state: opts.state,
  })
  return `${WHOOP_AUTH_URL}?${params.toString()}`
}

/** 用 authorization code 换 token */
export async function exchangeCodeForToken(opts: {
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
}): Promise<WhoopTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
  })

  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`WHOOP token exchange failed (${res.status}): ${t}`)
  }
  return res.json()
}

/**
 * 用 refresh token 续期。
 * ⚠️ scope 必须是 'offline' 单值，否则 WHOOP 返回 400 invalid_request。
 */
export async function refreshAccessToken(opts: {
  refreshToken: string
  clientId: string
  clientSecret: string
}): Promise<WhoopTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    scope: 'offline', // <- 关键：单值，不要传完整 scope 列表
  })

  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`WHOOP refresh failed (${res.status}): ${t}`)
  }
  return res.json()
}

/** 拿 WHOOP profile（用于绑定时拿 whoop_user_id） */
export async function getProfile(accessToken: string): Promise<{
  user_id: number
  email: string
  first_name: string
  last_name: string
}> {
  const res = await fetch(`${WHOOP_API_BASE}/v2/user/profile/basic`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`WHOOP profile fetch failed (${res.status}): ${await res.text()}`)
  }
  return res.json()
}

/** 通用 WHOOP API GET */
export async function whoopApiGet<T>(opts: {
  path: string
  accessToken: string
  query?: Record<string, string>
}): Promise<T> {
  const url = new URL(`${WHOOP_API_BASE}${opts.path}`)
  if (opts.query) {
    Object.entries(opts.query).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${opts.accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`WHOOP ${opts.path} failed (${res.status}): ${await res.text()}`)
  }
  return res.json()
}
