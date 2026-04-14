import http from '../lib/axios'

export const register = (data) => http.post('/auth/register', data).then((r) => r.data)
export const login = (data) => http.post('/auth/login', data).then((r) => r.data)
export const logout = () => http.post('/auth/logout').then((r) => r.data)
export const refresh = () => http.post('/auth/refresh').then((r) => r.data)
export const forgotPassword = (data) => http.post('/auth/forgot-password', data).then((r) => r.data)
export const resetPassword = (data) => http.post('/auth/reset-password', data).then((r) => r.data)
export const verifyEmail = (data) => http.post('/auth/verify-email', data).then((r) => r.data)
export const resendVerification = () => http.post('/auth/resend-verification').then((r) => r.data)
