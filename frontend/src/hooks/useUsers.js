import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/users'

export const USERS_KEY = ['users']
export const ME_KEY = ['me']

export function useUsers(params) {
  return useQuery({
    queryKey: [...USERS_KEY, params],
    queryFn: () => api.getUsers(params),
  })
}

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: api.getMe,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  })
}

export function useUpdateUser(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.updateUser(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  })
}

export function useUpdateMe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.updateMe,
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  })
}

export function useChangePassword() {
  return useMutation({ mutationFn: api.changePassword })
}

export const SMS_STATUS_KEY = ['sms-status']

export function useSmsStatus(enabled = true) {
  return useQuery({
    queryKey: SMS_STATUS_KEY,
    queryFn: api.getSmsStatus,
    enabled,
  })
}

export function useProvisionSms() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.provisionSms,
    onSuccess: () => qc.invalidateQueries({ queryKey: SMS_STATUS_KEY }),
  })
}

export function useDeprovisionSms() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deprovisionSms,
    onSuccess: () => qc.invalidateQueries({ queryKey: SMS_STATUS_KEY }),
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  })
}
