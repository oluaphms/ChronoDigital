import { QueryClient } from '@tanstack/react-query';

/**
 * QueryClient Configuration
 * 
 * Configuração global para React Query com otimizações de performance
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dados são considerados "fresh" por 5 minutos
      staleTime: 5 * 60 * 1000,
      
      // Cache é mantido por 10 minutos antes de ser descartado
      gcTime: 10 * 60 * 1000,
      
      // Tentar novamente 1 vez em caso de erro
      retry: 1,
      
      // Não refetch quando a janela ganha foco
      refetchOnWindowFocus: false,
      
      // Não refetch quando o componente é remontado
      refetchOnMount: false,
      
      // Não refetch quando a conexão é reconectada
      refetchOnReconnect: false,
    },
    mutations: {
      // Tentar novamente 1 vez em caso de erro
      retry: 1,
    },
  },
});
