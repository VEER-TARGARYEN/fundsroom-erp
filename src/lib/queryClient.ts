import { QueryClient } from '@tanstack/react-query'
import { isApiError } from './errors'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry auth/permission/validation errors — only transient ones.
        if (isApiError(error) && [400, 401, 403, 404].includes(error.status)) return false
        return failureCount < 2
      },
    },
    mutations: { retry: false },
  },
})
