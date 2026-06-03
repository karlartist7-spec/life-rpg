import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiSend } from './api-client'
import { supabase } from './supabase'
import type { PetsResponse } from './types'

export function usePets() {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['pets'], queryFn: () => apiFetch<PetsResponse>('/api/pets') })

  // Realtime: any change to my user_pets → refetch (evolve/hatch art, level-ups go live).
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const uid = data.user?.id
      if (!uid || cancelled) return
      channel = supabase
        .channel('user_pets_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_pets', filter: `user_id=eq.${uid}` },
          () => { qc.invalidateQueries({ queryKey: ['pets'] }) })
        .subscribe()
    })()
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel) }
  }, [qc])

  return query
}

export type EvolveResult =
  | { ok: true; target: number }
  | { ok: false; code: string; need?: { level?: number; item?: string } }

export function useSetPetActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { user_pet_id: string; active: boolean }): Promise<{ ok: true } | { ok: false; code: string }> => {
      const r = await apiSend<{ error?: string }>('/api/pets', 'PATCH', vars)
      if (r.ok) return { ok: true }
      return { ok: false, code: r.data?.error ?? `HTTP_${r.status}` }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pets'] }),
  })
}

export function useEvolvePet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { user_pet_id: string }): Promise<EvolveResult> => {
      const r = await apiSend<{ target?: number; error?: string; need?: { level?: number; item?: string } }>('/api/pets/evolve', 'POST', vars)
      if (r.ok) return { ok: true, target: r.data.target ?? 0 }
      return { ok: false, code: r.data?.error ?? `HTTP_${r.status}`, need: r.data?.need }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pets'] }),
  })
}
