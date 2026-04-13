import { useQuery } from '@tanstack/react-query'
import { getDashboard } from '../api/analytics'

export const ANALYTICS_KEY = ['analytics', 'dashboard']

export function useDashboard() {
  return useQuery({
    queryKey: ANALYTICS_KEY,
    queryFn:  getDashboard,
    // Cache data for 5 minutes. No polling — this just means navigating back
    // to the dashboard within 5 minutes skips a network request. After that,
    // TanStack Query silently refreshes on the next mount or window focus.
    staleTime: 5 * 60 * 1000,
  })
}
