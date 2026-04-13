import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/documents'

export const DOCUMENTS_KEY = ['documents']

export function useDocuments(params) {
  return useQuery({
    queryKey: [...DOCUMENTS_KEY, params],
    queryFn: () => api.getDocuments(params),
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.uploadDocument,
    onSuccess: () => qc.invalidateQueries({ queryKey: DOCUMENTS_KEY }),
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteDocument,
    onSuccess: () => qc.invalidateQueries({ queryKey: DOCUMENTS_KEY }),
  })
}

export function useDownloadDocument() {
  return useMutation({
    mutationFn: async (id) => {
      const { url, fileName } = await api.getDownloadUrl(id)
      // Open in new tab — browser handles PDF preview or triggers download
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
