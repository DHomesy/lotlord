import { useQuery, useMutation } from '@tanstack/react-query'
import * as api from '../api/billing'

export const SUBSCRIPTION_KEY = ['subscription']

export function useMySubscription() {
  return useQuery({
    queryKey: SUBSCRIPTION_KEY,
    queryFn:  api.getMySubscription,
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
