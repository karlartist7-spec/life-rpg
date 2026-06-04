import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './api-client'
import type { Dashboard } from './types'

/** Shared dashboard query — HUD, Home and Character all read it (React Query dedupes by key). */
export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => apiFetch<Dashboard>('/api/dashboard') })
}
