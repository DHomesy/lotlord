import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/payments'
import { useAuthStore } from '../store/authStore'

/** Admin: list a specific tenant's saved Stripe bank accounts */
export function usePaymentMethods(tenantId) {
  return useQuery({
    queryKey: ['payment-methods', tenantId],
    queryFn: () => api.getPaymentMethods(tenantId),
    enabled: !!tenantId,
  })
}

/** Tenant: list their own saved Stripe bank accounts */
export function useMyPaymentMethods() {
  return useQuery({
    queryKey: ['my-payment-methods'],
    queryFn: api.getMyPaymentMethods,
  })
}

/** Admin: create a SetupIntent on behalf of a tenant */
export function useCreateSetupIntent() {
  return useMutation({ mutationFn: api.createSetupIntent })
}

/** Landlord/Admin: get their Stripe Connect payout account status */
export function useConnectStatus() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['connect-status'],
    queryFn:  api.getConnectStatus,
    enabled:  user?.role === 'landlord' || user?.role === 'admin',
  })
}

/** Landlord/Admin: start or resume Stripe Connect Express onboarding */
export function useConnectOnboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createConnectOnboardingLink,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['connect-status'] }),
  })
}

/** Landlord/Admin: open Stripe Express Dashboard to manage existing payout account */
export function useConnectLogin() {
  return useMutation({ mutationFn: api.createConnectLoginLink })
}

/** Tenant: create a SetupIntent for their own account */
export function useCreateMySetupIntent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createMySetupIntent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-payment-methods'] }),
  })
}
