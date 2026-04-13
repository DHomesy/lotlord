import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import * as api from '../api/auth'

export function useRegister() {
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: api.register,
    onSuccess: (data) => {
      // Auto-login immediately after registration (backend returns token + sets refresh cookie)
      setAuth(data.user, data.token)
      if (data.user.role === 'tenant') {
        navigate('/my/dashboard', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    },
  })
}

export function useLogin() {
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: api.login,
    onSuccess: (data) => {
      setAuth(data.user, data.token)
      // Redirect based on role
      if (data.user.role === 'tenant') {
        navigate('/my/dashboard', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    },
  })
}

export function useLogout() {
  const { clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      clearAuth()
      qc.clear()
      navigate('/login', { replace: true })
    },
  })
}

export function useForgotPassword() {
  return useMutation({ mutationFn: api.forgotPassword })
}

export function useResetPassword() {
  const navigate = useNavigate()
  return useMutation({
    mutationFn: api.resetPassword,
    onSuccess: () => navigate('/login', { replace: true }),
  })
}
