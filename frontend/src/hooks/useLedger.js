import { useQuery } from '@tanstack/react-query'
import * as api from '../api/ledger'

export const LEDGER_KEY = ['ledger']

export function useLedger(params) {
  return useQuery({
    queryKey: [...LEDGER_KEY, params],
    queryFn: () => api.getLedger(params),
    enabled: !!params?.leaseId,
  })
}

export function usePortfolioSummary(params) {
  return useQuery({
    queryKey: [...LEDGER_KEY, 'portfolio', params],
    queryFn: () => api.getPortfolioSummary(params),
  })
}
