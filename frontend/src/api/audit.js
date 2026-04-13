import http from '../lib/axios'
const base = '/audit'

export const getAuditLog = (params) => http.get(base, { params }).then((r) => r.data)
