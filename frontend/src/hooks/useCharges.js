import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/charges'

export const CHARGES_KEY = ['charges']

export function useCharges(params) {
  return useQuery({
    queryKey: [...CHARGES_KEY, params],
    queryFn: () => api.getCharges(params),
    enabled: !!params,
  })
}

export function useCreateCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createCharge,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHARGES_KEY })
      qc.invalidateQueries({ queryKey: ['ledger'] })
    },
  })
}

export function useUpdateCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.updateCharge(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHARGES_KEY }),
  })
}

export function useVoidCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.voidCharge,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHARGES_KEY })
      qc.invalidateQueries({ queryKey: ['ledger'] })
    },
  })
}

