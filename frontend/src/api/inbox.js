import http from '../lib/axios'

const base = '/inbox'

export const getConversations    = (params) => http.get(base, { params }).then((r) => r.data)
export const getConversation     = (id) => http.get(`${base}/${id}`).then((r) => r.data)
export const updateConversation  = (id, data) => http.patch(`${base}/${id}`, data).then((r) => r.data)
export const sendReply           = (id, data) => http.post(`${base}/${id}/reply`, data).then((r) => r.data)
export const approveAiDraft      = (id, msgId) => http.post(`${base}/${id}/messages/${msgId}/approve`).then((r) => r.data)
export const dismissAiDraft      = (id, msgId) => http.delete(`${base}/${id}/messages/${msgId}`).then((r) => r.data)
