import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/units'

export const UNITS_KEY = ['units']

export function useUnits(params) {
  return useQuery({
    queryKey: [...UNITS_KEY, params],
    queryFn: () => api.getUnits(params),
  })
}

export function useUnit(id) {
  return useQuery({
    queryKey: [...UNITS_KEY, id],
    queryFn: () => api.getUnit(id),
    enabled: !!id,
  })
}

export function useCreateUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createUnit,
    onSuccess: () => qc.invalidateQueries({ queryKey: UNITS_KEY }),
  })
}

export function useUpdateUnit(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.updateUnit(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: UNITS_KEY }),
  })
}

export function useDeleteUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteUnit,
    onSuccess: () => qc.invalidateQueries({ queryKey: UNITS_KEY }),
  })
}
