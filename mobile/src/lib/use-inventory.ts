import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiSend } from './api-client'
import { supabase } from './supabase'
import type { InventoryResponse } from './types'
import type { UseEffect } from './inventory-derive'

export function useInventory() {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['inventory'], queryFn: () => apiFetch<InventoryResponse>('/api/inventory') })

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const uid = data.user?.id
      if (!uid || cancelled) return
      channel = supabase
        .channel('user_inventory_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_inventory', filter: `user_id=eq.${uid}` },
          () => { qc.invalidateQueries({ queryKey: ['inventory'] }) })
        .subscribe()
    })()
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel) }
  }, [qc])

  return query
}

export type UseItemResult = { ok: true; data: UseEffect } | { ok: false; code: string }
export function useUseItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { item_id: string }): Promise<UseItemResult> => {
      const r = await apiSend<UseEffect & { error?: string }>('/api/inventory/use', 'POST', vars)
      if (r.ok) return { ok: true, data: r.data }
      return { ok: false, code: r.data?.error ?? `HTTP_${r.status}` }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['pets'] })       // egg hatch creates a pet
      qc.invalidateQueries({ queryKey: ['dashboard'] })  // stamina/buffs change
    },
  })
}

export type EquipResult = { ok: true; equipped: boolean } | { ok: false; code: string }
export function useEquipItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { item_id: string; equipped: boolean }): Promise<EquipResult> => {
      const r = await apiSend<{ equipped?: boolean; error?: string }>('/api/inventory/equip', 'POST', vars)
      if (r.ok) return { ok: true, equipped: r.data.equipped ?? vars.equipped }
      return { ok: false, code: r.data?.error ?? `HTTP_${r.status}` }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  })
}
