import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/leases'

export const LEASES_KEY = ['leases']

export function useLeases(params, options = {}) {
  return useQuery({
    queryKey: [...LEASES_KEY, params],
    queryFn: () => api.getLeases(params),
    ...options,
  })
}

export function useLease(id) {
  return useQuery({
    queryKey: [...LEASES_KEY, id],
    queryFn: () => api.getLease(id),
    enabled: !!id,
  })
}

export function useCreateLease() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createLease,
    onSuccess: () => qc.invalidateQueries({ queryKey: LEASES_KEY }),
  })
}

export function useUpdateLease(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.updateLease(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEASES_KEY }),
  })
}

export function useTerminateLease() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.terminateLease,
    onSuccess: () => qc.invalidateQueries({ queryKey: LEASES_KEY }),
  })
}
