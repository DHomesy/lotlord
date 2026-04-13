import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/maintenance'

export const MAINTENANCE_KEY = ['maintenance']

export function useMaintenance(params) {
  return useQuery({
    queryKey: [...MAINTENANCE_KEY, params],
    queryFn: () => api.getRequests(params),
  })
}

export function useMaintenanceRequest(id) {
  return useQuery({
    queryKey: [...MAINTENANCE_KEY, id],
    queryFn: () => api.getRequest(id),
    enabled: !!id,
  })
}

export function useCreateMaintenanceRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: MAINTENANCE_KEY }),
  })
}

export function useUpdateMaintenanceRequest(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.updateRequest(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: MAINTENANCE_KEY }),
  })
}

export function useDeleteMaintenanceRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.deleteRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: MAINTENANCE_KEY }),
  })
}

export function useMaintenanceAttachments(requestId) {
  return useQuery({
    queryKey: [...MAINTENANCE_KEY, requestId, 'attachments'],
    queryFn: () => api.getAttachments(requestId),
    enabled: !!requestId,
  })
}

export function useAddAttachment(requestId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file) => api.uploadAttachment(requestId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...MAINTENANCE_KEY, requestId, 'attachments'] }),
  })
}

export function useRemoveAttachment(requestId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attachmentId) => api.removeAttachment(requestId, attachmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...MAINTENANCE_KEY, requestId, 'attachments'] }),
  })
}

export function useDownloadAttachment() {
  return useMutation({
    mutationFn: async ({ requestId, attachmentId, fileName }) => {
      const { url } = await api.getAttachmentDownloadUrl(requestId, attachmentId)
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.download = fileName || 'download'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    },
  })
}
