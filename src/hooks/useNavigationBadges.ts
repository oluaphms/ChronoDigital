import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured } from '../../services/supabase';
import { NotificationService } from '../../services/notificationService';
import { requestsQueries } from '../../services/queryOptimizations';
import type { User } from '../../types';

export interface NavigationBadges {
  requestsCount: number;
  notificationsCount: number;
}

export function useNavigationBadges(user: User | null): NavigationBadges {
  // ✅ OTIMIZADO: Usar React Query para cache automático
  const { data: requestsCount = 0 } = useQuery({
    queryKey: ['requests-count', user?.id],
    queryFn: () => user ? requestsQueries.countPendingRequests(user.id).then(r => r.count || 0) : Promise.resolve(0),
    enabled: !!user && isSupabaseConfigured,
    staleTime: 1 * 60 * 1000, // 1 minuto
    refetchInterval: 60 * 1000, // Refetch a cada 60 segundos
  });

  const { data: notificationsCount = 0 } = useQuery({
    queryKey: ['notifications-count', user?.id],
    queryFn: () => user ? NotificationService.getUnreadCount(user.id) : Promise.resolve(0),
    enabled: !!user && isSupabaseConfigured,
    staleTime: 1 * 60 * 1000, // 1 minuto
    refetchInterval: 60 * 1000, // Refetch a cada 60 segundos
  });

  return { requestsCount, notificationsCount };
}
