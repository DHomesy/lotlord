import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/notifications'

export const TEMPLATES_KEY     = ['notification-templates']
export const NOTIF_LOG_KEY     = ['notification-log']
export const CONVERSATIONS_KEY = ['notification-conversations']

export function useNotificationTemplates(params) {
  return useQuery({
    queryKey: [...TEMPLATES_KEY, params],
    queryFn: () => api.getTemplates(params),
  })
}

export function useNotificationLog(params) {
  return useQuery({
    queryKey: [...NOTIF_LOG_KEY, params],
    queryFn: () => api.getLog(params),
  })
}

export function useConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn:  api.getConversations,
  })
}

export function useConversation(tenantId) {
  return useQuery({
    queryKey: [...CONVERSATIONS_KEY, tenantId],
    queryFn:  () => api.getConversation(tenantId),
    enabled:  !!tenantId,
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export function useUpdateTemplate(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.updateTemplate(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.sendMessage,
    onSuccess: () => qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY }),
  })
}

export function useSendNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.sendNotification,
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIF_LOG_KEY }),
  })
}
