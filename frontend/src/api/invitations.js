import http from '../lib/axios'

const base = '/invitations'

export const createInvitation  = (data) => http.post(base, data).then((r) => r.data)
export const listInvitations   = (params) => http.get(base, { params }).then((r) => r.data)
export const resendInvitation  = (id) => http.post(`${base}/${id}/resend`).then((r) => r.data)
export const deleteInvitation  = (id) => http.delete(`${base}/${id}`).then((r) => r.data)

// Public — no auth token needed
export const getInvitation    = (token) => http.get(`${base}/${token}`).then((r) => r.data)
export const acceptInvitation = (token, data) => http.post(`${base}/${token}/accept`, data).then((r) => r.data)
