import http from '../lib/axios'
const base = '/properties'

export const getProperties = (params) => http.get(base, { params }).then((r) => r.data)
export const getProperty = (id) => http.get(`${base}/${id}`).then((r) => r.data)
export const createProperty = (data) => http.post(base, data).then((r) => r.data)
export const updateProperty = (id, data) => http.patch(`${base}/${id}`, data).then((r) => r.data)
export const deleteProperty = (id) => http.delete(`${base}/${id}`).then((r) => r.data)
