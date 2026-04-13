import http from '../lib/axios'
const base = '/documents'

export const getDocuments = (params) => http.get(base, { params }).then((r) => r.data)
export const getDocument = (id) => http.get(`${base}/${id}`).then((r) => r.data)
export const uploadDocument = (formData) =>
  http.post(base, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
export const getDownloadUrl = (id) => http.get(`${base}/${id}/download`).then((r) => r.data)
export const deleteDocument = (id) => http.delete(`${base}/${id}`).then((r) => r.data)
