/**
 * Processamento automático diário de ponto.
 * Para cada funcionário ativo: processEmployeeDay, detectInconsistencies,
 * calculateOvertime, calculateNightHours, saveNightHours, calculateBankHours, detectFraudAlerts.
 * Pode ser chamado por cron (ex.: 23:59) ou pela API /api/process-daily-time.
 */

import { db, isSupabaseConfigured } from '../services/supabaseClient';
import {
  processEmployeeDay,
  saveInconsistencies,
  saveNightHours,
  calculateBankHours,
  detectFraudAlerts,
  saveTimeAlerts,
} from '../engine/timeEngine';

export interface DailyProcessorResult {
  date: string;
  processed: number;
  errors: string[];
}

/**
 * Processa o ponto do dia para todos os funcionários da empresa (ou de todas as empresas).
 */
export async function runDailyTimeProcessor(dateStr?: string): Promise<DailyProcessorResult> {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  const errors: string[] = [];
  let processed = 0;

  if (!isSupabaseConfigured) {
    return { date, processed: 0, errors: ['Supabase não configurado'] };
  }

  const users = (await db.select('users', [], undefined, 5000)) as any[];
  const employees = users?.filter((u: any) => u.company_id && (u.role === 'employee' || u.role === 'admin' || u.role === 'hr')) ?? [];

  for (const emp of employees) {
    try {
      const summary = await processEmployeeDay(emp.id, emp.company_id, date);

      await saveInconsistencies(emp.id, emp.company_id, date, summary.inconsistencies);
      await saveNightHours(emp.id, emp.company_id, date, summary.night_minutes);

      const rules = (await db.select('overtime_rules', [{ column: 'company_id', operator: 'eq', value: emp.company_id }], undefined, 1)) as any[];
      const bankEnabled = rules?.[0]?.bank_hours_enabled !== false;
      const overtimeHours = ((summary.overtime?.overtime_50_minutes || 0) + (summary.overtime?.overtime_100_minutes || 0)) / 60;
      const missingHours = summary.daily.missing_minutes / 60;
      await calculateBankHours(emp.id, emp.company_id, date, overtimeHours, missingHours, bankEnabled);

      const alerts = detectFraudAlerts(
        emp.id,
        date,
        summary.daily.records,
        summary.daily.total_worked_minutes,
        summary.daily.break_minutes
      );
      await saveTimeAlerts(emp.id, emp.company_id, date, alerts);

      processed++;
    } catch (e: any) {
      errors.push(`${emp.nome || emp.id}: ${e?.message || 'Erro'}`);
    }
  }

  return { date, processed, errors };
}
