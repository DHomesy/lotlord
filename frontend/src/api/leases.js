import http from '../lib/axios'
const base = '/leases'

export const getLeases = (params) => http.get(base, { params }).then((r) => r.data)
export const getLease = (id) => http.get(`${base}/${id}`).then((r) => r.data)
export const createLease = (data) => http.post(base, data).then((r) => r.data)
export const updateLease = (id, data) => http.patch(`${base}/${id}`, data).then((r) => r.data)
export const terminateLease = (id) => http.post(`${base}/${id}/terminate`).then((r) => r.data)
