/**
 * UPSERT inteligente em timesheets_daily — anti-sobrescrita, sem alterar schema.
 */

import { getSupabaseClient } from './supabaseClient';
import { validateTimesheetIntegrity } from './timesheetIntegrity';
import {
  type TimesheetProcessingStatus,
  type TimesheetWriteOutcome,
  processingStatusFromWrite,
} from './timesheetProcessingStatus';
import {
  applyCalculationAuditToRaw,
  buildCalculationContext,
  contextsSemanticallyEqual,
  type CalculationResultSnapshot,
} from './timesheetCalculationAudit';

export type TimesheetDailyRowPayload = {
  employee_id: string;
  company_id: string;
  date: string;
  worked_minutes: number;
  expected_minutes: number;
  overtime_minutes: number;
  absence_minutes: number;
  night_minutes: number;
  late_minutes: number;
  is_absence: boolean;
  is_holiday: boolean;
  raw_data: Record<string, unknown>;
  updated_at: string;
  /** Metadados de auditoria (não persistidos como chave própria; viram calculation_context no raw_data). */
  calculation_audit?: {
    punches: unknown[];
    schedule_used: unknown;
    correlation_id?: string;
    calculation_type?: 'normal' | 'fallback';
  };
};

function isProtectedRaw(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  if (r.manual_entry === true) return true;
  if (r.status === 'closed') return true;
  return Boolean(r.manual_lock === true || r.manual_override === true);
}

function coreFieldsEqual(
  a: Partial<TimesheetDailyRowPayload>,
  b: Partial<TimesheetDailyRowPayload>,
): boolean {
  return (
    Number(a.worked_minutes) === Number(b.worked_minutes) &&
    Number(a.expected_minutes) === Number(b.expected_minutes) &&
    Number(a.overtime_minutes) === Number(b.overtime_minutes) &&
    Number(a.absence_minutes) === Number(b.absence_minutes) &&
    Number(a.night_minutes) === Number(b.night_minutes) &&
    Number(a.late_minutes) === Number(b.late_minutes) &&
    Boolean(a.is_absence) === Boolean(b.is_absence) &&
    Boolean(a.is_holiday) === Boolean(b.is_holiday)
  );
}

export type { TimesheetWriteOutcome, TimesheetProcessingStatus } from './timesheetProcessingStatus';

export type TimesheetWriteResult = {
  outcome: TimesheetWriteOutcome;
  id?: string | null;
  processing_status: TimesheetProcessingStatus;
};

function finalizeWrite(
  outcome: TimesheetWriteOutcome,
  rawForStatus: Record<string, unknown> | undefined,
  payload: TimesheetDailyRowPayload,
  id?: string | null,
): TimesheetWriteResult {
  const processing_status = processingStatusFromWrite(outcome, rawForStatus);
  console.info('[CALC STATUS]', {
    date: payload.date,
    employee_id: payload.employee_id,
    status: processing_status,
  });
  return { outcome, id: id ?? null, processing_status };
}

/** Escreve linha calculada pelo motor (origem sistema). */
export async function writeTimesheetsDailyCalculatedRow(
  payload: TimesheetDailyRowPayload,
  options?: {
    skipClosedRpc?: boolean;
  },
): Promise<TimesheetWriteResult> {
  const integrity = await validateTimesheetIntegrity({
    employee_id: payload.employee_id,
    company_id: payload.company_id,
  });
  if (!integrity.ok) {
    console.info('[CALC SKIP] employee_integrity_failed', {
      employee_id: payload.employee_id,
      company_id: payload.company_id,
      date: payload.date,
      reason: integrity.reason,
    });
    return finalizeWrite('skipped_integrity', payload.raw_data, payload);
  }

  const client = getSupabaseClient();
  if (!client) return finalizeWrite('skipped_integrity', payload.raw_data, payload);

  if (!options?.skipClosedRpc) {
    const refTs = new Date(`${payload.date}T12:00:00`).toISOString();
    const { data: closed, error: rpcErr } = await client.rpc('timesheet_is_closed_for_stamp', {
      p_company_id: payload.company_id,
      p_employee_id: payload.employee_id,
      p_ref_ts: refTs,
    });
    if (rpcErr) {
      console.info('[CALC INFO] timesheet_closed_check_failed', {
        employee_id: payload.employee_id,
        company_id: payload.company_id,
        date: payload.date,
        message: rpcErr.message,
      });
    } else if (closed) {
      console.info('[CALC SKIP] protected_record', {
        employee_id: payload.employee_id,
        company_id: payload.company_id,
        date: payload.date,
        reason: 'timesheet_closed_rpc',
      });
      return finalizeWrite('skipped_closed', payload.raw_data, payload);
    }
  }

  const { data: existing } = await client
    .from('timesheets_daily')
    .select('id, company_id, worked_minutes, expected_minutes, overtime_minutes, absence_minutes, night_minutes, late_minutes, is_absence, is_holiday, raw_data')
    .eq('employee_id', payload.employee_id)
    .eq('date', payload.date)
    .maybeSingle();

  if (existing?.company_id && String(existing.company_id) !== String(payload.company_id)) {
    console.info('[CALC SKIP] invalid_employee_reference', {
      employee_id: payload.employee_id,
      company_id: payload.company_id,
      date: payload.date,
      reason: 'row_tenant_mismatch',
    });
    return finalizeWrite('skipped_integrity', payload.raw_data, payload);
  }

  const rawEx = existing?.raw_data as Record<string, unknown> | undefined;
  if (rawEx && isProtectedRaw(rawEx)) {
    console.info('[CALC SKIP] protected_record', {
      employee_id: payload.employee_id,
      company_id: payload.company_id,
      date: payload.date,
      reason: 'manual_or_closed_raw',
    });
    return finalizeWrite('skipped_protected', payload.raw_data, payload);
  }

  const mergedRaw: Record<string, unknown> = {
    ...(typeof rawEx === 'object' && rawEx ? rawEx : {}),
    ...payload.raw_data,
    calc_origin: 'system',
  };

  const inferredFallback =
    mergedRaw.has_schedule_issue === true || mergedRaw.contingency_schedule_fallback === true;
  const calculation_type: 'normal' | 'fallback' =
    payload.calculation_audit?.calculation_type ?? (inferredFallback ? 'fallback' : 'normal');
  const ctxPreview = buildCalculationContext({
    punches: payload.calculation_audit?.punches ?? [],
    schedule_used: payload.calculation_audit?.schedule_used ?? null,
    calculation_type,
  });
  const noopNumeric =
    existing?.id && coreFieldsEqual(existing as Partial<TimesheetDailyRowPayload>, payload);
  const noopSemantic = contextsSemanticallyEqual(rawEx?.calculation_context, ctxPreview);
  if (noopNumeric && noopSemantic) {
    console.info('[CALC INFO] timesheet_unchanged', {
      employee_id: payload.employee_id,
      date: payload.date,
    });
    return finalizeWrite('skipped_noop', mergedRaw, payload, existing?.id ?? null);
  }

  const resultSnapshot: CalculationResultSnapshot = {
    worked_minutes: payload.worked_minutes,
    expected_minutes: payload.expected_minutes,
    overtime_minutes: payload.overtime_minutes,
    absence_minutes: payload.absence_minutes,
    night_minutes: payload.night_minutes,
    late_minutes: payload.late_minutes,
    is_absence: payload.is_absence,
    is_holiday: payload.is_holiday,
  };

  await applyCalculationAuditToRaw({
    mergedRaw,
    resultSnapshot,
    auditInput: payload.calculation_audit,
    previousRaw: rawEx,
    auditAction: existing?.id ? 'recalculated' : 'calculated',
    auditReason: noopNumeric && !noopSemantic ? 'context_changed' : 'calculation_persisted',
  });

  const { calculation_audit: _calculationAuditOmit, ...payloadForDb } = payload;
  const rowToWrite = {
    ...payloadForDb,
    raw_data: mergedRaw,
    created_at: new Date().toISOString(),
  };

  const runUpsert = () =>
    client
      .from('timesheets_daily')
      .upsert(rowToWrite, { onConflict: 'employee_id,date' })
      .select('id')
      .maybeSingle();

  let upserted: { id?: string } | null = null;
  let error: { message: string; code?: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await runUpsert();
    upserted = res.data;
    error = res.error;
    if (!error) break;
    const code = (error as { code?: string }).code;
    const isConflict =
      code === '23505' || /conflict|409|duplicate/i.test(String(error?.message ?? ''));
    if (isConflict && attempt === 0) {
      await new Promise((r) => setTimeout(r, 40 + Math.floor(Math.random() * 80)));
      continue;
    }
    break;
  }

  if (error) {
    console.info('[CALC INFO] timesheet_write_failed', {
      employee_id: payload.employee_id,
      date: payload.date,
      message: error.message,
      code: (error as { code?: string }).code,
    });
    return finalizeWrite('skipped_integrity', mergedRaw, payload);
  }

  console.info('[CALC UPDATE] recalculated', {
    employee_id: payload.employee_id,
    company_id: payload.company_id,
    date: payload.date,
    had_existing: Boolean(existing?.id),
  });
  return finalizeWrite('written', mergedRaw, payload, upserted?.id ?? existing?.id ?? null);
}
