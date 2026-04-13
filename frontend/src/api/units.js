import http from '../lib/axios'
const base = '/units'

export const getUnits = (params) => http.get(base, { params }).then((r) => r.data)
export const getUnit = (id) => http.get(`${base}/${id}`).then((r) => r.data)
export const createUnit = (data) => http.post(base, data).then((r) => r.data)
export const updateUnit = (id, data) => http.patch(`${base}/${id}`, data).then((r) => r.data)
export const deleteUnit = (id) => http.delete(`${base}/${id}`).then((r) => r.data)
