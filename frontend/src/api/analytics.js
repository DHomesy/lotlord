import http from '../lib/axios'

export const getDashboard = () =>
  http.get('/analytics/dashboard').then((r) => r.data)

export const getOwnerQaQuality = (params) =>
  http.get('/analytics/owner-qa-quality', { params }).then((r) => r.data)
