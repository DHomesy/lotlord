import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/invitations'

export const INVITATIONS_KEY = ['invitations']

export function useInvitations(params) {
  return useQuery({
    queryKey: [...INVITATIONS_KEY, params],
    queryFn: () => api.listInvitations(params),
  })
}

/** Public hook — validate a token before showing the signup form. */
export function useInvitation(token) {
  return useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api.getInvitation(token),
    enabled: !!token,
    retry: false, // invalid/expired tokens should show an error immediately
  })
}

export function useCreateInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createInvitation,
    onSuccess: () => qc.invalidateQueries({ queryKey: INVITATIONS_KEY }),
  })
}

export function useResendInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.resendInvitation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVITATIONS_KEY }),
  })
}

export function useDeleteInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.deleteInvitation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVITATIONS_KEY }),
  })
}

export function useAcceptInvitation(token) {
  return useMutation({
    mutationFn: (data) => api.acceptInvitation(token, data),
  })
}
