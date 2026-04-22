import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/payments'

export const PAYMENTS_KEY = ['payments']

export function usePayments(params) {
  return useQuery({
    queryKey: [...PAYMENTS_KEY, params],
    queryFn: () => api.getPayments(params),
    enabled: !!params?.leaseId,
  })
}

export function useCreatePaymentIntent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createPaymentIntent,
    onSuccess: () => qc.invalidateQueries({ queryKey: PAYMENTS_KEY }),
  })
}

/** Tenant self-service: pay one of their own charges by chargeId + paymentMethodId */
export function useCreateMyPaymentIntent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createMyPaymentIntent,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY })
      qc.invalidateQueries({ queryKey: ['charges'] })
    },
  })
}

/** Admin/landlord/employee: record a manual cash/check/zelle payment */
export function useRecordManualPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.recordManualPayment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY })
      qc.invalidateQueries({ queryKey: ['charges'] })
      qc.invalidateQueries({ queryKey: ['ledger'] })
    },
  })
}
