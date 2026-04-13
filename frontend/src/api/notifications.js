import http from '../lib/axios'
const base = '/notifications'

export const getTemplates    = (params) => http.get(`${base}/templates`, { params }).then((r) => r.data)
export const createTemplate  = (data) => http.post(`${base}/templates`, data).then((r) => r.data)
export const updateTemplate  = (id, data) => http.patch(`${base}/templates/${id}`, data).then((r) => r.data)
export const deleteTemplate  = (id) => http.delete(`${base}/templates/${id}`).then((r) => r.data)
export const getLog          = (params) => http.get(`${base}/log`, { params }).then((r) => r.data)
export const sendNotification = (data) => http.post(`${base}/send`, data).then((r) => r.data)

// ── Messages (conversations) ─────────────────────────────────────────────────
export const getConversations = () => http.get(`${base}/messages`).then((r) => r.data)
export const getConversation  = (tenantId) => http.get(`${base}/messages/${tenantId}`).then((r) => r.data)
export const sendMessage      = (data) => http.post(`${base}/messages`, data).then((r) => r.data)
