import http from '../lib/axios'

const base = '/inbox'

export const getConversations    = (params) => http.get(base, { params }).then((r) => r.data)
export const getUnreadSummary    = () => http.get(`${base}/unread-summary`).then((r) => r.data)
export const getOwnerQaSnapshot  = (data) => http.post(`${base}/owner-qa/snapshot`, data).then((r) => r.data)
export const getOwnerQaSessions  = (params) => http.get(`${base}/owner-qa/sessions`, { params }).then((r) => r.data)
export const createOwnerQaSession = (data) => http.post(`${base}/owner-qa/sessions`, data).then((r) => r.data)
export const getOwnerQaSession   = (sessionId, params) => http.get(`${base}/owner-qa/sessions/${sessionId}`, { params }).then((r) => r.data)
export const updateOwnerQaSession = (sessionId, data) => http.patch(`${base}/owner-qa/sessions/${sessionId}`, data).then((r) => r.data)
export const deleteOwnerQaSession = (sessionId) => http.delete(`${base}/owner-qa/sessions/${sessionId}`).then((r) => r.data)
export const createOwnerQaSessionSnapshot = (sessionId, data) => http.post(`${base}/owner-qa/sessions/${sessionId}/snapshot`, data).then((r) => r.data)
export const getConversation     = (id) => http.get(`${base}/${id}`).then((r) => r.data)
export const getConversationTrace = (id) => http.get(`${base}/${id}/trace`).then((r) => r.data)
export const updateConversation  = (id, data) => http.patch(`${base}/${id}`, data).then((r) => r.data)
export const sendReply           = (id, data) => http.post(`${base}/${id}/reply`, data).then((r) => r.data)
export const approveAiDraft      = (id, msgId) => http.post(`${base}/${id}/messages/${msgId}/approve`).then((r) => r.data)
export const dismissAiDraft      = (id, msgId) => http.delete(`${base}/${id}/messages/${msgId}`).then((r) => r.data)
