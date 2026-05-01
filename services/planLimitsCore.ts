/**
 * Regras de plano sem dependência de cliente Supabase (uso no browser, API e triggers correlatos).
 */

import type { TenantPlan } from '../types';

export const TENANT_PLAN_FREE_EMPLOYEE_MAX = 5;
export const TENANT_PLAN_PRO_EMPLOYEE_MAX = 50;

export function normalizeTenantPlan(value: unknown): TenantPlan {
  const v = String(value ?? 'free').toLowerCase().trim();
  if (v === 'pro') return 'pro';
  if (v === 'enterprise') return 'enterprise';
  return 'free';
}

export function getMaxEmployeesForPlan(plan: TenantPlan): number | null {
  if (plan === 'enterprise') return null;
  if (plan === 'pro') return TENANT_PLAN_PRO_EMPLOYEE_MAX;
  return TENANT_PLAN_FREE_EMPLOYEE_MAX;
}

export type EmployeeSeatEvaluation = {
  allowed: boolean;
  plan: TenantPlan;
  currentCount: number;
  maxEmployees: number | null;
  afterAdd: number;
  reason?: string;
};

export function evaluateEmployeeSeat(
  plan: TenantPlan,
  currentActiveEmployees: number,
  additionalSeats = 1,
): EmployeeSeatEvaluation {
  const max = getMaxEmployeesForPlan(plan);
  const afterAdd = currentActiveEmployees + additionalSeats;
  if (max == null) {
    return { allowed: true, plan, currentCount: currentActiveEmployees, maxEmployees: null, afterAdd };
  }
  if (afterAdd <= max) {
    return { allowed: true, plan, currentCount: currentActiveEmployees, maxEmployees: max, afterAdd };
  }
  const reason =
    plan === 'free'
      ? `O plano Free permite até ${max} colaboradores ativos. Faça upgrade para adicionar mais.`
      : `O plano Pro permite até ${max} colaboradores ativos. Faça upgrade para Enterprise (ilimitado).`;
  return {
    allowed: false,
    plan,
    currentCount: currentActiveEmployees,
    maxEmployees: max,
    afterAdd,
    reason,
  };
}

export type PlanFeatureKey = 'rep_afd_import' | 'rep_fiscalizacao' | 'rep_devices';

export function isPlanFeatureEnabled(plan: TenantPlan, _feature: PlanFeatureKey): boolean {
  void _feature;
  return plan !== 'free';
}
