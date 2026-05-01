import { describe, it, expect } from 'vitest';
import { assertPlanLimit, PlanLimitError, PLAN_LIMIT_CODE } from './planEnforcement';

/** Mock mínimo da cadeia Supabase usada por assertPlanLimit */
function mockClient(opts: { plan: string; activeEmployeeCount: number }) {
  return {
    from(table: string) {
      if (table === 'companies') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { plan: opts.plan }, error: null }),
            }),
          }),
        };
      }
      if (table === 'users') {
        return {
          select: (_sel: string, _opt?: { count?: string; head?: boolean }) => ({
            eq: () => ({
              eq: () => ({
                eq: async () => ({ count: opts.activeEmployeeCount, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('assertPlanLimit', () => {
  it('bloqueia CREATE_EMPLOYEE no Free quando já no limite', async () => {
    const client = mockClient({ plan: 'free', activeEmployeeCount: 5 }) as any;
    await expect(
      assertPlanLimit(client, { tenantId: 't1', action: { type: 'CREATE_EMPLOYEE' } }),
    ).rejects.toMatchObject({ code: PLAN_LIMIT_CODE });
  });

  it('permite CREATE_EMPLOYEE no Free com vaga', async () => {
    const client = mockClient({ plan: 'free', activeEmployeeCount: 4 }) as any;
    await expect(
      assertPlanLimit(client, { tenantId: 't1', action: { type: 'CREATE_EMPLOYEE' } }),
    ).resolves.toBeUndefined();
  });

  it('bloqueia USE_REP rep_afd_import no Free', async () => {
    const client = mockClient({ plan: 'free', activeEmployeeCount: 0 }) as any;
    await expect(
      assertPlanLimit(client, {
        tenantId: 't1',
        action: { type: 'USE_REP', feature: 'rep_afd_import' },
      }),
    ).rejects.toBeInstanceOf(PlanLimitError);
  });

  it('permite USE_REP no Pro', async () => {
    const client = mockClient({ plan: 'pro', activeEmployeeCount: 0 }) as any;
    await expect(
      assertPlanLimit(client, {
        tenantId: 't1',
        action: { type: 'USE_REP', feature: 'rep_devices' },
      }),
    ).resolves.toBeUndefined();
  });
});
