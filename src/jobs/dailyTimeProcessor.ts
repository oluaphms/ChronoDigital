/**
 * Processamento automático diário de ponto.
 * Para cada funcionário ativo: processEmployeeDay, detectInconsistencies,
 * calculateOvertime, calculateNightHours, saveNightHours, calculateBankHours, detectFraudAlerts.
 * Pode ser chamado por cron (ex.: 23:59) ou pela API /api/process-daily-time.
 */

import { isSupabaseConfigured } from '../services/supabaseClient';
import { db } from '../services/supabaseClient';
import { getDayRecords } from '../services/timeProcessingService';
import { parseTimeRecords } from '../engine/timeEngine';
import {
  processEmployeeDay,
  saveInconsistencies,
  saveNightHours,
  calculateBankHours,
  detectFraudAlerts,
  saveTimeAlerts,
  getCompanyRules,
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

  if (!isSupabaseConfigured()) {
    return { date, processed: 0, errors: ['Supabase não configurado'] };
  }

  const users = (await db.select('users', [], undefined, 5000)) as any[];
  const employees = users?.filter((u: any) => u.company_id && (u.role === 'employee' || u.role === 'admin' || u.role === 'hr')) ?? [];

  for (const emp of employees) {
    try {
      const summary = await processEmployeeDay(emp.id, emp.company_id, date);

      await saveInconsistencies(emp.id, emp.company_id, date, summary.inconsistencies);
      await saveNightHours(emp.id, emp.company_id, date, summary.night_minutes);

      const companyRules = await getCompanyRules(emp.company_id);
      const bankEnabled = companyRules.time_bank_enabled;
      /** Com BH ligado o motor grava em `bank_hours_ledger` (FIFO real); não duplica em `bank_hours` legacy. */
      if (!bankEnabled) {
        const overtimeHours = Number(summary.bank_hours_delta || 0) / 60;
        const missingHours = summary.daily.missing_minutes / 60;
        await calculateBankHours(emp.id, emp.company_id, date, overtimeHours, missingHours, false);
      }

      const dayRecords = await getDayRecords(emp.id, date);
      const parsed = parseTimeRecords(dayRecords);
      const alerts = detectFraudAlerts(
        emp.id,
        date,
        dayRecords,
        summary.daily.total_worked_minutes,
        parsed.breakMinutes
      );
      await saveTimeAlerts(emp.id, emp.company_id, date, alerts);

      processed++;
    } catch (e: any) {
      errors.push(`${emp.nome || emp.id}: ${e?.message || 'Erro'}`);
    }
  }

  return { date, processed, errors };
}
