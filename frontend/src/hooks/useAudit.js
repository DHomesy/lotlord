import { useQuery } from '@tanstack/react-query'
import * as api from '../api/audit'

export const AUDIT_KEY = ['audit']

export function useAuditLog(params) {
  return useQuery({
    queryKey: [...AUDIT_KEY, params],
    queryFn: () => api.getAuditLog(params),
  })
}
