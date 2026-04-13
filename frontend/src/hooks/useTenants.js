import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/tenants'
import { useLeases } from './useLeases'

export const TENANTS_KEY = ['tenants']
export const TENANT_ME_KEY = ['tenant-me']

export function useTenantMe() {
  return useQuery({
    queryKey: TENANT_ME_KEY,
    queryFn: api.getTenantMe,
    staleTime: 5 * 60 * 1000, // 5 min — changes rarely
  })
}

/**
 * Convenience hook for tenant portal pages.
 * Chains /tenants/me → /leases?tenantId=X and resolves the active lease.
 * Returns { tenantMe, activeLease, leases, isLoading }
 */
export function useMyLease() {
  const { data: tenantMe, isLoading: loadingMe } = useTenantMe()
  const { data: leasesData, isLoading: loadingLeases } = useLeases(
    tenantMe?.id ? { tenantId: tenantMe.id } : undefined,
    { enabled: !!tenantMe?.id },
  )
  const leases = Array.isArray(leasesData) ? leasesData : (leasesData?.leases ?? [])
  const activeLease = leases.find((l) => l.status === 'active')
  return { tenantMe, activeLease, leases, isLoading: loadingMe || loadingLeases }
}

export function useTenants(params) {
  return useQuery({
    queryKey: [...TENANTS_KEY, params],
    queryFn: () => api.getTenants(params),
  })
}

export function useTenant(id) {
  return useQuery({
    queryKey: [...TENANTS_KEY, id],
    queryFn: () => api.getTenant(id),
    enabled: !!id,
  })
}

export function useCreateTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createTenant,
    onSuccess: () => qc.invalidateQueries({ queryKey: TENANTS_KEY }),
  })
}

export function useUpdateTenant(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.updateTenant(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: TENANTS_KEY }),
  })
}

export function useDeleteTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteTenant,
    onSuccess: () => qc.invalidateQueries({ queryKey: TENANTS_KEY }),
  })
}
