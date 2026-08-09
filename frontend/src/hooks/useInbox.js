import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/inbox'

export const INBOX_KEY = ['inbox']
export const INBOX_SUMMARY_KEY = ['inbox-unread-summary']

export function useInboxConversations(params) {
  return useQuery({
    queryKey: [...INBOX_KEY, params],
    queryFn:  () => api.getConversations(params),
    // Refresh the list so unread badges, new conversations, and AI draft indicators
    // stay current without requiring a page navigation.
    refetchInterval: 30_000,
  })
}

export function useInboxUnreadSummary() {
  return useQuery({
    queryKey: INBOX_SUMMARY_KEY,
    queryFn: api.getUnreadSummary,
    refetchInterval: 30_000,
  })
}

export function useInboxConversation(id) {
  return useQuery({
    queryKey: [...INBOX_KEY, id],
    queryFn:  () => api.getConversation(id),
    enabled:  !!id,
    // Refetch every 15s so the thread stays current without manual refresh
    refetchInterval: 15_000,
  })
}

export function useInboxConversationTrace(id) {
  return useQuery({
    queryKey: [...INBOX_KEY, id, 'trace'],
    queryFn: () => api.getConversationTrace(id),
    enabled: !!id,
    refetchInterval: 15_000,
  })
}

export function useUpdateInboxConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.updateConversation(id, data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: INBOX_KEY })
      qc.invalidateQueries({ queryKey: INBOX_SUMMARY_KEY })
    },
  })
}

export function useSendInboxReply() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.sendReply(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INBOX_KEY })
      qc.invalidateQueries({ queryKey: INBOX_SUMMARY_KEY })
    },
  })
}

export function useApproveAiDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, msgId }) => api.approveAiDraft(id, msgId),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: INBOX_KEY })
      qc.invalidateQueries({ queryKey: INBOX_SUMMARY_KEY })
    },
  })
}

export function useDismissAiDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, msgId }) => api.dismissAiDraft(id, msgId),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: INBOX_KEY })
      qc.invalidateQueries({ queryKey: INBOX_SUMMARY_KEY })
    },
  })
}
