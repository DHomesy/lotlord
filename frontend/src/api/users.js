import http from '../lib/axios'
const base = '/users'

export const getUsers = (params) => http.get(base, { params }).then((r) => r.data)
export const getUser = (id) => http.get(`${base}/${id}`).then((r) => r.data)
export const createUser = (data) => http.post(base, data).then((r) => r.data)
export const updateUser = (id, data) => http.patch(`${base}/${id}`, data).then((r) => r.data)
export const deleteUser = (id) => http.delete(`${base}/${id}`).then((r) => r.data)
export const getMe = () => http.get(`${base}/me`).then((r) => r.data)
export const updateMe = (data) => http.patch(`${base}/me`, data).then((r) => r.data)
export const changePassword = (data) => http.post(`${base}/me/password`, data).then((r) => r.data)
