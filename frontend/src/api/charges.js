import http from '../lib/axios'
const base = '/charges'

export const getCharges = (params) => http.get(base, { params }).then((r) => r.data)
export const getCharge = (id) => http.get(`${base}/${id}`).then((r) => r.data)
export const createCharge = (data) => http.post(base, data).then((r) => r.data)
export const updateCharge = (id, data) => http.patch(`${base}/${id}`, data).then((r) => r.data)
export const voidCharge = (id) => http.post(`${base}/${id}/void`).then((r) => r.data)
