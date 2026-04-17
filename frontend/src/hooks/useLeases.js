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

// ── Co-tenants ────────────────────────────────────────────────────────────────
// Query key shape: ['leases', leaseId, 'co-tenants']
// All three mutations invalidate that key on success so the list refreshes.

/** Returns the co-tenant list for the given lease. Disabled until leaseId is known. */
export function useCoTenants(leaseId) {
  return useQuery({
    queryKey: [...LEASES_KEY, leaseId, 'co-tenants'],
    queryFn:  () => api.getCoTenants(leaseId),
    enabled:  !!leaseId,
  })
}

/** Mutation: add a tenant as a co-tenant on leaseId. Pass a tenantId string as the mutate arg. */
export function useAddCoTenant(leaseId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tenantId) => api.addCoTenant({ leaseId, tenantId }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: [...LEASES_KEY, leaseId, 'co-tenants'] }),
  })
}

/** Mutation: remove a co-tenant from leaseId. Pass the tenantId string as the mutate arg. */
export function useRemoveCoTenant(leaseId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tenantId) => api.removeCoTenant({ leaseId, tenantId }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: [...LEASES_KEY, leaseId, 'co-tenants'] }),
  })
}
