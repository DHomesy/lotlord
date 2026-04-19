import http from '../lib/axios'

const base = '/invitations'

export const createInvitation         = (data) => http.post(base, data).then((r) => r.data)
export const createEmployeeInvitation = (data) => http.post(`${base}/employee`, data).then((r) => r.data)
export const listInvitations   = (params) => http.get(base, { params }).then((r) => r.data)
export const resendInvitation  = (id) => http.post(`${base}/${id}/resend`).then((r) => r.data)
export const deleteInvitation  = (id) => http.delete(`${base}/${id}`).then((r) => r.data)

// Public — no auth token needed; token is sent in the request body (not URL) to avoid log exposure
export const getInvitation    = (token) => http.post(`${base}/validate`, { token }).then((r) => r.data)
export const acceptInvitation = (token, data) => http.post(`${base}/accept`, { token, ...data }).then((r) => r.data)
