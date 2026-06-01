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
