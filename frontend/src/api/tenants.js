import http from '../lib/axios'
const base = '/tenants'

export const getTenants = (params) => http.get(base, { params }).then((r) => r.data)
export const getTenant = (id) => http.get(`${base}/${id}`).then((r) => r.data)
export const getTenantMe = () => http.get(`${base}/me`).then((r) => r.data)
export const createTenant = (data) => http.post(base, data).then((r) => r.data)
export const updateTenant = (id, data) => http.patch(`${base}/${id}`, data).then((r) => r.data)
export const deleteTenant = (id) => http.delete(`${base}/${id}`).then((r) => r.data)
