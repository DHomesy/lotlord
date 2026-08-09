import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/supervisor'

export const SUPERVISOR_KEY = ['supervisor']
export const SUPERVISOR_UNMATCHED_KEY = ['supervisor-unmatched-inbound']

export function useSupervisorConversations(params) {
  return useQuery({
    queryKey: [...SUPERVISOR_KEY, params],
    queryFn:  () => api.getSupervisorConversations(params),
    refetchInterval: 30_000,
  })
}

export function useSupervisorOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, content }) => api.supervisorOverride(id, { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SUPERVISOR_KEY }),
  })
}

export function useSupervisorUpdate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.supervisorUpdate(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SUPERVISOR_KEY }),
  })
}

export function useUnmatchedInboundQueue(params) {
  return useQuery({
    queryKey: [...SUPERVISOR_UNMATCHED_KEY, params],
    queryFn: () => api.getUnmatchedInboundQueue(params),
    refetchInterval: 30_000,
  })
}

export function useUpdateUnmatchedInbound() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.updateUnmatchedInbound(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SUPERVISOR_UNMATCHED_KEY }),
  })
}
