import http from '../lib/axios'
const base = '/maintenance'

export const getRequests = (params) => http.get(base, { params }).then((r) => r.data)
export const getRequest = (id) => http.get(`${base}/${id}`).then((r) => r.data)
export const createRequest = (data) => http.post(base, data).then((r) => r.data)
export const updateRequest = (id, data) => http.patch(`${base}/${id}`, data).then((r) => r.data)
export const deleteRequest = (id) => http.delete(`${base}/${id}`).then((r) => r.data)

export const getAttachments = (requestId) =>
  http.get(`${base}/${requestId}/attachments`).then((r) => r.data)

export const uploadAttachment = (requestId, file) => {
  const form = new FormData()
  form.append('file', file)
  return http.post(`${base}/${requestId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const getAttachmentDownloadUrl = (requestId, attachmentId) =>
  http.get(`${base}/${requestId}/attachments/${attachmentId}/download`).then((r) => r.data)

export const removeAttachment = (requestId, attachmentId) =>
  http.delete(`${base}/${requestId}/attachments/${attachmentId}`).then((r) => r.data)
