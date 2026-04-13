import http from '../lib/axios'

export const getDashboard = () =>
  http.get('/analytics/dashboard').then((r) => r.data)
