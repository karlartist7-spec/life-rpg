import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiSend } from './api-client'
import { supabase } from './supabase'
import type { AdventuresResponse, AdventureDetailResponse } from './types'

function useAdventuresRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const uid = data.user?.id
      if (!uid || cancelled) return
      channel = supabase
        .channel('adventures_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'adventures', filter: `user_id=eq.${uid}` },
          () => {
            qc.invalidateQueries({ queryKey: ['adventures'] })
            qc.invalidateQueries({ queryKey: ['adventure'] })
            qc.invalidateQueries({ queryKey: ['dashboard'] })
          })
        .subscribe()
    })()
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel) }
  }, [qc])
}

export function useAdventures() {
  useAdventuresRealtime()
  return useQuery({ queryKey: ['adventures'], queryFn: () => apiFetch<AdventuresResponse>('/api/adventures') })
}

export function useAdventure(id: string) {
  useAdventuresRealtime()
  return useQuery({
    queryKey: ['adventure', id],
    queryFn: () => apiFetch<AdventureDetailResponse>(`/api/adventures?id=${id}`),
    enabled: !!id,
  })
}

export function useRetryAdventure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { adventure_id: string }): Promise<{ ok: true; status: string } | { ok: false; code: string }> => {
      const r = await apiSend<{ status?: string; error?: string }>('/api/adventures/retry', 'POST', vars)
      if (r.ok) return { ok: true, status: r.data.status ?? 'pending' }
      return { ok: false, code: r.data?.error ?? `HTTP_${r.status}` }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adventures'] })
      qc.invalidateQueries({ queryKey: ['adventure'] })
    },
  })
}
