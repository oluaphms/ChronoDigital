import { db, isSupabaseConfigured } from '../services/supabaseClient';
import type { BankLotRow } from './bankLedgerFifo';
import {
  bankFifoBalanceAtStartOfDay,
  simulateBankFifoWithExpiryForPeriod,
} from './bankLedgerFifo';

/** Créditos e débitos usados apenas pelo motor do dia (permite reaplicar período sem duplicar). */
export const DAILY_AUTO_META_SCOPE = 'timeEngine.bank_daily.v1';

export type BankEntryOrigin = 'extra' | 'negative' | 'compensation' | 'manual';

export interface BankLedgerRow extends BankLotRow {
  origin: BankEntryOrigin;
  meta?: Record<string, unknown>;
  id?: string;
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
      columns: 'minutes, date, origin, created_at, meta, expires_at, id',
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
    expires_at:
      (row as { expires_at?: unknown }).expires_at !== undefined &&
      (row as { expires_at?: unknown }).expires_at !== null
        ? String((row as { expires_at?: unknown }).expires_at)
        : null,
    id: (row as { id?: unknown }).id ? String((row as { id?: unknown }).id) : undefined,
    meta: ((row as { meta?: Record<string, unknown> }).meta as Record<string, unknown>) ?? {},
  }));
}

function sortLedgerFifo(rows: BankLedgerRow[]): BankLotRow[] {
  return [...rows]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map(({ minutes, date, created_at, expires_at }) => ({ minutes, date, created_at, expires_at: expires_at ?? null }));
}

function addMonthsToBookingDateUtc(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
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
  /** default true — se false, negativa não abate BH (vai inteira para folha). */
  allowAutoCompensation?: boolean;
  bankHoursExpiryMonths?: number;
}): Promise<ApplyDailyBankLedgerResult> {
  const { employeeId, companyId, dateStr, extraDay, negativeDay } = params;
  const cap = params.maxAbsBalanceMinutes ?? 40 * 60;
  const allowComp = params.allowAutoCompensation !== false;
  const expiryMonths =
    typeof params.bankHoursExpiryMonths === 'number' && params.bankHoursExpiryMonths > 0
      ? params.bankHoursExpiryMonths
      : 6;

  if (!isSupabaseConfigured() || !companyId) {
    const credited0 = Math.max(0, extraDay);
    const compensated0 =
      allowComp ? Math.min(Math.max(0, negativeDay), Math.max(0, credited0)) : 0;
    return {
      creditedExtra: credited0,
      compensatedFromBank: compensated0,
      payrollNegativeMinutes: Math.max(0, negativeDay - compensated0),
      balanceAfterApprox: Math.max(-cap, Math.min(cap, credited0 - compensated0)),
    };
  }

  await deleteDailyAutoEntries(employeeId, companyId, dateStr);

  const fetched = await fetchLedgerRows(employeeId, companyId);
  const fifoSorted = sortLedgerFifo(fetched);
  const balanceStart = bankFifoBalanceAtStartOfDay(fifoSorted, dateStr);

  let credited = Math.max(0, Math.round(extraDay));
  if (credited > 0 && cap > 0) {
    credited = Math.min(credited, Math.max(0, cap - balanceStart));
  }

  let compensated = 0;
  let remaining_negative = Math.max(0, Math.round(negativeDay));
  if (allowComp) {
    const r = compensateNegativeWithBankBalance(remaining_negative, balanceStart, credited);
    compensated = r.compensated;
    remaining_negative = r.remaining_negative;
  }

  const inserts: Array<{ minutes: number; origin: BankEntryOrigin; expires_at?: string | null }> = [];
  if (credited > 0)
    inserts.push({
      minutes: credited,
      origin: 'extra',
      expires_at: addMonthsToBookingDateUtc(dateStr, expiryMonths),
    });
  if (compensated > 0)
    inserts.push({ minutes: -compensated, origin: 'compensation', expires_at: null });

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
        expires_at: chunk.expires_at ?? null,
        meta: metaPayload,
      })
      .catch(() => undefined);
  }

  const fifoResidualApprox = balanceStart + credited - compensated;

  console.log('[CALC] BH ledger', {
    date: dateStr,
    creditedExtra: credited,
    compensatedFromBank: compensated,
    payrollNegativeRemainder: remaining_negative,
    fifoApproxAfter: fifoResidualApprox,
    allow_auto_compensation: allowComp,
  });

  return {
    creditedExtra: credited,
    compensatedFromBank: compensated,
    payrollNegativeMinutes: remaining_negative,
    balanceAfterApprox: Math.round(Math.max(-cap, Math.min(cap, fifoResidualApprox))),
  };
}

export async function getBankBalanceFifoApprox(employeeId: string, companyId: string): Promise<number> {
  const fetched = await fetchLedgerRows(employeeId, companyId);
  const rows = sortLedgerFifo(fetched);
  const periodEnd = new Date().toISOString().slice(0, 10);
  const { residualMinutes } = simulateBankFifoWithExpiryForPeriod(rows, periodEnd);
  return Math.round(residualMinutes);
}

/** Minutos de crédito BH expirados no período → conversão conceptual em HE 50% para folha. */
export async function getBankExpiredToPayroll50ForPeriod(
  employeeId: string,
  companyId: string,
  periodEndDate: string,
): Promise<{ residualMinutes: number; payrollExtra50FromExpiredMinutes: number }> {
  if (!companyId || !isSupabaseConfigured()) {
    return { residualMinutes: 0, payrollExtra50FromExpiredMinutes: 0 };
  }
  const fetched = await fetchLedgerRows(employeeId, companyId);
  const rows = sortLedgerFifo(fetched);
  return simulateBankFifoWithExpiryForPeriod(rows, periodEndDate.slice(0, 10));
}
