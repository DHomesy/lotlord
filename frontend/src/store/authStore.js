import { create } from 'zustand'

/**
 * Auth store — only for the current user and their in-memory access token.
 * All server data lives in TanStack Query. Never copy API responses here.
 */
export const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isLoading: true, // true until boot() resolves

  setAuth: (user, token) => set({ user, token, isLoading: false }),
  clearAuth: () => set({ user: null, token: null, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}))
