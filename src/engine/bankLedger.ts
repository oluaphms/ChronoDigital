import { db, isSupabaseConfigured } from '../services/supabaseClient';

/** Créditos e débitos usados apenas pelo motor do dia (permite reaplicar período sem duplicar). */
export const DAILY_AUTO_META_SCOPE = 'timeEngine.bank_daily.v1';

export type BankEntryOrigin = 'extra' | 'negative' | 'compensation' | 'manual';

export interface BankLedgerRow {
  minutes: number;
  date: string;
  origin: BankEntryOrigin;
  created_at: string;
  meta?: Record<string, unknown>;
}

/** Soma algebraic simples dos lançamentos. */
export function bankBalanceFromLedger(rows: Pick<BankLedgerRow, 'minutes'>[]): number {
  return rows.reduce((s, r) => s + (r.minutes || 0), 0);
}

/**
 * Consumo FIFO: cada crédito positivo empilhado por ordem cronológica; débitos (minutos ≤ 0) consomem do topo do estoque remanescente.
 * `compensation`: também consome FIFO (mantém comportamento intuitivo nos recálculos parciais).
 */
export function simulateFifoResidualMinutes(rowsSorted: BankLedgerRow[]): number {
  const queue: number[] = [];
  for (const r of rowsSorted) {
    const m = r.minutes;
    if (m > 0) {
      queue.push(m);
      continue;
    }
    let debt = -m;
    while (debt > 0 && queue.length) {
      const head = queue[0];
      const take = Math.min(head, debt);
      queue[0] = head - take;
      debt -= take;
      if (queue[0] <= 0) queue.shift();
    }
  }
  return queue.reduce((a, b) => a + b, 0);
}

export function compensateNegativeWithBankBalance(
  dayNegative: number,
  fifoResidualBeforeNewCredit: number,
  newCreditSameDay: number
): { compensated: number; remaining_negative: number } {
  const available = Math.max(0, fifoResidualBeforeNewCredit) + Math.max(0, newCreditSameDay);
  const compensated = Math.min(Math.max(0, dayNegative), Math.max(0, available));
  return {
    compensated,
    remaining_negative: Math.max(0, dayNegative - compensated),
  };
}

async function fetchLedgerRows(employeeId: string, companyId: string): Promise<BankLedgerRow[]> {
  if (!companyId || !isSupabaseConfigured()) return [];
  const raw = await db.select(
    'bank_entries',
    [
      { column: 'employee_id', operator: 'eq', value: employeeId },
      { column: 'company_id', operator: 'eq', value: companyId },
    ],
    {
      columns: 'minutes, date, origin, created_at, meta',
      orderBy: { column: 'created_at', ascending: true },
      limit: 10000,
    },
  ).catch(() => [] as Record<string, unknown>[]);
  const list = Array.isArray(raw) ? raw : [];
  return list.map((row) => ({
    minutes: Number((row as { minutes?: unknown }).minutes) || 0,
    date: String((row as { date?: unknown }).date || ''),
    origin: (row as { origin?: unknown }).origin as BankEntryOrigin,
    created_at: String((row as { created_at?: unknown }).created_at || ''),
    meta: ((row as { meta?: Record<string, unknown> }).meta as Record<string, unknown>) ?? {},
  }));
}

/** Remove lançamentos automáticos do dia civil antes de relançar (idempotência de recálculo). */
async function deleteDailyAutoEntries(
  employeeId: string,
  companyId: string,
  dateStr: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const ids: string[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const chunk = (
      await db
        .selectPaginated('bank_entries', {
          columns: 'id,meta',
          filters: [
            { column: 'employee_id', operator: 'eq', value: employeeId },
            { column: 'company_id', operator: 'eq', value: companyId },
            { column: 'date', operator: 'eq', value: dateStr },
          ],
          orderBy: { column: 'created_at', ascending: true },
          limit: pageSize,
          offset,
        })
        .catch(() => ({ data: [], count: null }))
    ).data as Array<{ id?: string; meta?: Record<string, unknown> }>;
    ids.push(...chunk.filter((row) => row?.meta?.scope === DAILY_AUTO_META_SCOPE).map((row) => String(row?.id)));

    if (chunk.length < pageSize) break;
  }

  if (!ids.length) return;

  await Promise.all(ids.filter(Boolean).map((id: string) => db.delete('bank_entries', id).catch(() => undefined)));
}

export interface ApplyDailyBankLedgerResult {
  creditedExtra: number;
  compensatedFromBank: number;
  /** Negativa que segue para desconto em folha (após abatimento do BH). */
  payrollNegativeMinutes: number;
  balanceAfterApprox: number;
}

/**
 * Quando BH ativo: credita extra do dia, abate negativa por FIFO (créditos mais antigos primeiro + crédito do próprio dia).
 * Não duplica débito “negativo bruto” + compensação: só compensação gera saída de saldo.
 */
export async function applyDailyBankLedger(params: {
  employeeId: string;
  companyId: string;
  dateStr: string;
  extraDay: number;
  negativeDay: number;
  maxAbsBalanceMinutes?: number;
}): Promise<ApplyDailyBankLedgerResult> {
  const { employeeId, companyId, dateStr, extraDay, negativeDay } = params;
  const cap = params.maxAbsBalanceMinutes ?? 40 * 60;

  if (!isSupabaseConfigured() || !companyId) {
    const available = Math.max(0, extraDay);
    const compensated = Math.min(Math.max(0, negativeDay), available);
    return {
      creditedExtra: Math.max(0, extraDay),
      compensatedFromBank: compensated,
      payrollNegativeMinutes: Math.max(0, negativeDay - compensated),
      balanceAfterApprox: Math.max(-cap, Math.min(cap, extraDay - compensated)),
    };
  }

  await deleteDailyAutoEntries(employeeId, companyId, dateStr);

  const ledgerSortedBase = [...(await fetchLedgerRows(employeeId, companyId))].sort((a, b) => {
    const c = String(a.date).localeCompare(String(b.date));
    if (c !== 0) return c;
    return String(a.created_at).localeCompare(String(b.created_at));
  });

  let fifoResidual = simulateFifoResidualMinutes(ledgerSortedBase);

  let credited = Math.max(0, Math.round(extraDay));
  if (credited > 0 && cap > 0) {
    credited = Math.min(credited, Math.max(0, cap - fifoResidual));
  }

  const { compensated, remaining_negative } = compensateNegativeWithBankBalance(
    Math.max(0, Math.round(negativeDay)),
    fifoResidual,
    credited,
  );

  const inserts: Array<{ minutes: number; origin: BankEntryOrigin }> = [];
  if (credited > 0)
    inserts.push({ minutes: credited, origin: 'extra' });
  if (compensated > 0)
    inserts.push({ minutes: -compensated, origin: 'compensation' });

  const metaPayload = {
    scope: DAILY_AUTO_META_SCOPE,
    date: dateStr,
  };

  for (const chunk of inserts) {
    await db
      .insert('bank_entries', {
        employee_id: employeeId,
        company_id: companyId,
        date: dateStr,
        minutes: chunk.minutes,
        origin: chunk.origin,
        meta: metaPayload,
      })
      .catch(() => undefined);
  }

  fifoResidual += credited - compensated;

  console.log('[CALC] BH ledger', {
    date: dateStr,
    creditedExtra: credited,
    compensatedFromBank: compensated,
    payrollNegativeRemainder: remaining_negative,
    fifoApproxAfter: fifoResidual,
  });

  return {
    creditedExtra: credited,
    compensatedFromBank: compensated,
    payrollNegativeMinutes: remaining_negative,
    balanceAfterApprox: Math.round(Math.max(-cap, Math.min(cap, fifoResidual))),
  };
}

export async function getBankBalanceFifoApprox(employeeId: string, companyId: string): Promise<number> {
  const fetched = await fetchLedgerRows(employeeId, companyId);
  const rows = [...fetched].sort((a, b) => {
    const c = String(a.date).localeCompare(String(b.date));
    if (c !== 0) return c;
    return String(a.created_at).localeCompare(String(b.created_at));
  });
  return Math.round(simulateFifoResidualMinutes(rows));
}
