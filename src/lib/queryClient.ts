import { QueryClient } from '@tanstack/vue-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 2 minutes
      staleTime: 1000 * 60 * 2,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});
