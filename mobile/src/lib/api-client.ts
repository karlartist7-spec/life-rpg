import { supabase } from './supabase'
import { API_BASE_URL } from './env'

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const t = data.session?.access_token
  return t ? { Authorization: `Bearer ${t}` } : {}
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`
  const doFetch = async () =>
    fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(await authHeader()), ...(init.headers || {}) } })

  let res = await doFetch()
  if (res.status === 401) {
    const { error } = await supabase.auth.refreshSession()
    if (!error) res = await doFetch()
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`)
  return res.json() as Promise<T>
}

/** Like apiFetch but never throws on non-2xx — returns the status + parsed JSON so
 *  callers can branch on domain error codes (e.g. PET_SLOT_FULL). 401 refresh-retries once. */
export async function apiSend<T = unknown>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown
): Promise<{ ok: boolean; status: number; data: T }> {
  const url = `${API_BASE_URL}${path}`
  const doFetch = async () =>
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: body == null ? undefined : JSON.stringify(body),
    })
  let res = await doFetch()
  if (res.status === 401) {
    const { error } = await supabase.auth.refreshSession()
    if (!error) res = await doFetch()
  }
  const data = (await res.json().catch(() => ({}))) as T
  return { ok: res.ok, status: res.status, data }
}
