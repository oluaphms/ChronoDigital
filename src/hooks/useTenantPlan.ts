import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  countActiveEmployeesForCompany,
  fetchCompanyPlan,
  getMaxEmployeesForPlan,
  normalizeTenantPlan,
  type TenantPlan,
} from '../../services/tenantPlan.service';
import { isSupabaseConfigured } from '../services/supabaseClient';

export interface UseTenantPlanResult {
  plan: TenantPlan;
  maxEmployees: number | null;
  employeeCount: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Plano da empresa + contagem de colaboradores ativos (para limites e UI).
 */
export function useTenantPlan(companyId: string | undefined): UseTenantPlanResult {
  const [plan, setPlan] = useState<TenantPlan>('free');
  const [employeeCount, setEmployeeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const maxEmployees = useMemo(() => getMaxEmployeesForPlan(plan), [plan]);

  const load = useCallback(async () => {
    if (!companyId || !isSupabaseConfigured()) {
      setPlan('free');
      setEmployeeCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [p, c] = await Promise.all([fetchCompanyPlan(companyId), countActiveEmployeesForCompany(companyId)]);
      setPlan(normalizeTenantPlan(p));
      setEmployeeCount(c);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar plano');
      setPlan('free');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { plan, maxEmployees, employeeCount, loading, error, refetch: load };
}
