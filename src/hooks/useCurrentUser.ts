import { useEffect, useState } from 'react';
import { authService } from '../../services/authService';
import { User } from '../../types';

function getStoredUser(): User | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem('current_user');
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        let u = await authService.getCurrentUser();

        // Evita falso "sem usuário" em corrida de sessão logo após navegação/login.
        if (!u) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          u = await authService.getCurrentUser();
        }

        if (!u) {
          // Fallback para o cache local persistido após login bem-sucedido.
          u = getStoredUser();
        }

        if (mounted) setUser(u);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    // Mantém o user sincronizado com mudanças reais de sessão.
    const unsubscribe = authService.onAuthStateChanged((nextUser) => {
      if (!mounted) return;
      setUser(nextUser ?? getStoredUser());
      setLoading(false);
    });

    return () => {
      mounted = false;
      try {
        unsubscribe?.();
      } catch {
        // noop
      }
    };
  }, []);

  return { user, loading };
}

