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
      setAuth(data.user, data.token)
      if (data.user.role === 'tenant') {
        navigate('/my/dashboard', { replace: true })
      } else if (!data.user.email_verified_at) {
        // New landlord — send straight to the "check your inbox" page
        navigate('/verify-email-pending', { replace: true })
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

export function useVerifyEmail() {
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: api.verifyEmail,
    onSuccess: (data) => {
      // If the backend returns a new token after verification, update auth state
      if (data?.user && data?.token) {
        setAuth(data.user, data.token)
      }
      navigate('/dashboard', { replace: true })
    },
  })
}

export function useResendVerification() {
  return useMutation({ mutationFn: api.resendVerification })
}
