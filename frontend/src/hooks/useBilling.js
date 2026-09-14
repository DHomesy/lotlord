import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/billing'

export const SUBSCRIPTION_KEY = ['subscription']

export function useMySubscription(options = {}) {
  return useQuery({
    queryKey: SUBSCRIPTION_KEY,
    queryFn:  api.getMySubscription,
    ...options,
  })
}

export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: (plan = 'starter') => api.createCheckoutSession(plan),
    onSuccess: ({ url }) => { window.location.href = url },
  })
}

export function useCreateBillingPortalSession() {
  return useMutation({
    mutationFn: api.createBillingPortalSession,
    onSuccess: ({ url }) => { window.location.href = url },
  })
}

export function useLandlordSubscriptions() {
  return useQuery({
    queryKey: ['landlord-subscriptions'],
    queryFn:  api.getLandlordSubscriptions,
  })
}

function useSubscriptionMutation(mutationFn) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY }),
  })
}

export function useCancelSubscription() {
  return useSubscriptionMutation(api.cancelSubscription)
}

export function useReactivateSubscription() {
  return useSubscriptionMutation(api.reactivateSubscription)
}

export function useCompleteBillingPaymentMethod() {
  return useSubscriptionMutation(api.completeBillingPaymentMethod)
}
