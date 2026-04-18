/**
 * Serviço de cálculo de Pré-Folha (jornada de trabalho).
 * Responsável por calcular horas trabalhadas, extras, faltas e noturnas.
 * NÃO calcula valores monetários (salários, impostos) - foco apenas em jornada.
 */

import { db, checkSupabaseConfigured, isSupabaseConfigured } from './supabaseClient';
import { processDailyTime, getEmployeeSchedule, getDayRecords } from './timeProcessingService';
import { calculateNightHours } from '../engine/timeEngine';

// ============ TIPOS ============

export interface DailyTimesheet {
  id?: string;
  employee_id: string;
  company_id: string;
  date: string; // YYYY-MM-DD
  worked_minutes: number;
  expected_minutes: number;
  overtime_minutes: number;
  absence_minutes: number;
  night_minutes: number;
  late_minutes: number;
  is_absence: boolean;
  is_holiday: boolean;
  raw_data?: Record<string, unknown>;
}

export interface PayrollSummary {
  id?: string;
  employee_id: string;
  company_id: string;
  employee_name?: string;
  period_start: string;
  period_end: string;
  total_worked_minutes: number;
  total_expected_minutes: number;
  total_overtime_minutes: number;
  total_absence_minutes: number;
  total_night_minutes: number;
  total_late_minutes: number;
  total_work_days: number;
  total_absence_days: number;
  status: 'draft' | 'calculated' | 'exported';
  calculated_at?: string;
  notes?: string;
}

export interface CalculatedPayrollRow {
  employee_id: string;
  employee_name: string;
  email?: string;
  worked_hours: number;
  expected_hours: number;
  overtime_hours: number;
  absence_hours: number;
  night_hours: number;
  late_hours: number;
  work_days: number;
  absence_days: number;
}

// ============ CONSTANTES ============

const DEFAULT_EXPECTED_MINUTES = 480; // 8 horas
const NIGHT_START_HOUR = 22; // 22:00
const NIGHT_END_HOUR = 5; // 05:00

// ============ FUNÇÕES DE CÁLCULO DIÁRIO ============

/**
 * Calcula o timesheet diário baseado nas batidas do funcionário.
 * Regras:
 * - worked_minutes: total de minutos trabalhados (entrada até saída - intervalos)
 * - expected_minutes: jornada esperada (padrão 8h = 480min)
 * - overtime: excedente sobre esperado
 * - absence: faltante quando não atinge o esperado
 * - night_minutes: minutos entre 22h e 5h
 */
export async function calculateDailyTimesheet(
  employeeId: string,
  companyId: string,
  dateStr: string,
  expectedMinutes: number = DEFAULT_EXPECTED_MINUTES
): Promise<DailyTimesheet> {
  // Busca a escala do funcionário
  const schedule = await getEmployeeSchedule(employeeId, companyId);
  const expectedMin = schedule 
    ? (schedule.daily_hours * 60) 
    : expectedMinutes;

  // Processa o dia usando o serviço existente
  const dailyResult = await processDailyTime(
    employeeId,
    companyId,
    dateStr,
    schedule || {
      start_time: '08:00',
      end_time: '17:00',
      break_start: '12:00',
      break_end: '13:00',
      tolerance_minutes: 10,
      daily_hours: 8,
      work_days: [1, 2, 3, 4, 5],
    }
  );

  // Calcula minutos noturnos
  const records = await getDayRecords(employeeId, dateStr);
  const nightMinutes = calculateNightHours(records);

  // Determina se é falta (dia de trabalho sem marcações)
  const dayOfWeek = new Date(dateStr).getDay();
  const isWorkDay = schedule ? schedule.work_days.includes(dayOfWeek) : (dayOfWeek >= 1 && dayOfWeek <= 5);
  const isAbsence = isWorkDay && dailyResult.total_worked_minutes === 0;

  // Calcula minutos de falta
  let absenceMinutes = 0;
  if (isAbsence) {
    absenceMinutes = expectedMin;
  } else if (isWorkDay && dailyResult.total_worked_minutes < expectedMin) {
    absenceMinutes = expectedMin - dailyResult.total_worked_minutes;
  }

  return {
    employee_id: employeeId,
    company_id: companyId,
    date: dateStr,
    worked_minutes: dailyResult.total_worked_minutes,
    expected_minutes: isWorkDay ? expectedMin : 0,
    overtime_minutes: dailyResult.overtime_minutes,
    absence_minutes: absenceMinutes,
    night_minutes: nightMinutes,
    late_minutes: dailyResult.late_minutes,
    is_absence: isAbsence,
    is_holiday: false, // TODO: integrar com tabela de feriados
    raw_data: {
      entrada: dailyResult.entrada,
      saida: dailyResult.saida,
      inicio_intervalo: dailyResult.inicio_intervalo,
      fim_intervalo: dailyResult.fim_intervalo,
      records_count: records.length,
    },
  };
}

/**
 * Salva ou atualiza o cálculo diário no banco de dados.
 */
export async function saveDailyTimesheet(data: DailyTimesheet): Promise<string> {
  if (!checkSupabaseConfigured()) throw new Error('Supabase não configurado.');

  const payload = {
    employee_id: data.employee_id,
    company_id: data.company_id,
    date: data.date,
    worked_minutes: data.worked_minutes,
    expected_minutes: data.expected_minutes,
    overtime_minutes: data.overtime_minutes,
    absence_minutes: data.absence_minutes,
    night_minutes: data.night_minutes,
    late_minutes: data.late_minutes,
    is_absence: data.is_absence,
    is_holiday: data.is_holiday,
    raw_data: data.raw_data || {},
    updated_at: new Date().toISOString(),
  };

  try {
    const existing = await db.select('timesheets_daily', [
      { column: 'employee_id', operator: 'eq', value: data.employee_id },
      { column: 'date', operator: 'eq', value: data.date },
    ]) as any[];

    if (existing?.[0]?.id) {
      await db.update('timesheets_daily', existing[0].id, payload);
      return existing[0].id;
    } else {
      const result = await db.insert('timesheets_daily', {
        ...payload,
        created_at: new Date().toISOString(),
      }) as any[];
      return result?.[0]?.id;
    }
  } catch (err: any) {
    // Se a tabela não existe, loga e retorna ID simulado
    if (err?.message?.includes('relation') || err?.message?.includes('does not exist')) {
      console.warn('[saveDailyTimesheet] Tabela timesheets_daily não existe. Execute a migração: 20260417230000_pre_folha_tables.sql');
      // Retorna um ID temporário para não quebrar o fluxo
      return `temp-${data.employee_id}-${data.date}`;
    }
    throw err;
  }
}

// ============ FUNÇÕES DE CONSOLIDAÇÃO ============

/**
 * Gera o resumo de pré-folha para um funcionário no período.
 * Consolida todos os cálculos diários em totais.
 */
export async function generatePayrollSummary(
  employeeId: string,
  companyId: string,
  startDate: string,
  endDate: string,
  autoCalculate: boolean = true
): Promise<PayrollSummary> {
  if (!checkSupabaseConfigured()) throw new Error('Supabase não configurado.');

  // Se solicitado, calcula todos os dias do período primeiro
  if (autoCalculate) {
    await calculatePeriodTimesheets(employeeId, companyId, startDate, endDate);
  }

  // Busca os dados consolidados
  const result = await db.rpc?.('calculate_payroll_summary', {
    p_employee_id: employeeId,
    p_company_id: companyId,
    p_start_date: startDate,
    p_end_date: endDate,
  }) as any;

  // Se a função RPC não existir, calcula manualmente
  if (!result?.data) {
    return await calculatePayrollSummaryManual(employeeId, companyId, startDate, endDate);
  }

  const data = result.data;
  
  return {
    employee_id: data.employee_id,
    company_id: companyId,
    period_start: data.period_start,
    period_end: data.period_end,
    total_worked_minutes: data.total_worked_minutes,
    total_expected_minutes: data.total_expected_minutes,
    total_overtime_minutes: data.total_overtime_minutes,
    total_absence_minutes: data.total_absence_minutes,
    total_night_minutes: data.total_night_minutes,
    total_late_minutes: data.total_late_minutes,
    total_work_days: data.total_work_days,
    total_absence_days: data.total_absence_days,
    status: 'calculated',
    calculated_at: new Date().toISOString(),
  };
}

/**
 * Calcula manualmente o resumo (fallback se RPC não disponível).
 */
async function calculatePayrollSummaryManual(
  employeeId: string,
  companyId: string,
  startDate: string,
  endDate: string
): Promise<PayrollSummary> {
  let dailyRecords: any[] = [];
  
  try {
    dailyRecords = await db.select('timesheets_daily', [
      { column: 'employee_id', operator: 'eq', value: employeeId },
      { column: 'company_id', operator: 'eq', value: companyId },
      { column: 'date', operator: 'gte', value: startDate },
      { column: 'date', operator: 'lte', value: endDate },
    ]) as any[];
  } catch (err: any) {
    // Se a tabela não existe ou há erro de permissão, continua com array vazio
    if (err?.message?.includes('relation') || 
        err?.message?.includes('does not exist') ||
        err?.status === 400 ||
        err?.status === 404) {
      console.warn(`[calculatePayrollSummaryManual] Tabela timesheets_daily não acessível para ${employeeId}:`, err?.message || 'Erro 400');
      dailyRecords = [];
    } else {
      throw err;
    }
  }

  let totalWorked = 0;
  let totalExpected = 0;
  let totalOvertime = 0;
  let totalAbsence = 0;
  let totalNight = 0;
  let totalLate = 0;
  let workDays = 0;
  let absenceDays = 0;

  for (const record of dailyRecords || []) {
    totalWorked += record.worked_minutes || 0;
    totalExpected += record.expected_minutes || 0;
    totalOvertime += record.overtime_minutes || 0;
    totalAbsence += record.absence_minutes || 0;
    totalNight += record.night_minutes || 0;
    totalLate += record.late_minutes || 0;
    
    if (record.worked_minutes > 0) workDays++;
    if (record.is_absence) absenceDays++;
  }

  return {
    employee_id: employeeId,
    company_id: companyId,
    period_start: startDate,
    period_end: endDate,
    total_worked_minutes: totalWorked,
    total_expected_minutes: totalExpected,
    total_overtime_minutes: totalOvertime,
    total_absence_minutes: totalAbsence,
    total_night_minutes: totalNight,
    total_late_minutes: totalLate,
    total_work_days: workDays,
    total_absence_days: absenceDays,
    status: 'calculated',
    calculated_at: new Date().toISOString(),
  };
}

/**
 * Calcula o timesheet para todos os dias de um período.
 */
export async function calculatePeriodTimesheets(
  employeeId: string,
  companyId: string,
  startDate: string,
  endDate: string
): Promise<DailyTimesheet[]> {
  const results: DailyTimesheet[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    try {
      const timesheet = await calculateDailyTimesheet(employeeId, companyId, dateStr);
      // Tenta salvar, mas não falha se a tabela não existir
      await saveDailyTimesheet(timesheet);
      results.push(timesheet);
    } catch (err: any) {
      // Loga o erro mas continua calculando os outros dias
      console.warn(`[calculatePeriodTimesheets] Erro ao processar ${dateStr}:`, err?.message);
      // Cria um registro vazio para este dia
      results.push({
        employee_id: employeeId,
        company_id: companyId,
        date: dateStr,
        worked_minutes: 0,
        expected_minutes: 480,
        overtime_minutes: 0,
        absence_minutes: 0,
        night_minutes: 0,
        late_minutes: 0,
        is_absence: false,
        is_holiday: false,
        raw_data: { error: err?.message },
      });
    }
  }

  return results;
}

/**
 * Salva o resumo de pré-folha no banco.
 */
export async function savePayrollSummary(summary: PayrollSummary): Promise<string> {
  if (!checkSupabaseConfigured()) throw new Error('Supabase não configurado.');

  const payload = {
    employee_id: summary.employee_id,
    company_id: summary.company_id,
    period_start: summary.period_start,
    period_end: summary.period_end,
    total_worked_minutes: summary.total_worked_minutes,
    total_expected_minutes: summary.total_expected_minutes,
    total_overtime_minutes: summary.total_overtime_minutes,
    total_absence_minutes: summary.total_absence_minutes,
    total_night_minutes: summary.total_night_minutes,
    total_late_minutes: summary.total_late_minutes,
    total_work_days: summary.total_work_days,
    total_absence_days: summary.total_absence_days,
    status: summary.status,
    calculated_at: summary.calculated_at,
    notes: summary.notes,
    updated_at: new Date().toISOString(),
  };

  try {
    const existing = await db.select('payroll_summaries', [
      { column: 'employee_id', operator: 'eq', value: summary.employee_id },
      { column: 'period_start', operator: 'eq', value: summary.period_start },
      { column: 'period_end', operator: 'eq', value: summary.period_end },
    ]) as any[];

    if (existing?.[0]?.id) {
      await db.update('payroll_summaries', existing[0].id, payload);
      return existing[0].id;
    } else {
      const result = await db.insert('payroll_summaries', {
        ...payload,
        created_at: new Date().toISOString(),
      }) as any[];
      return result?.[0]?.id;
    }
  } catch (err: any) {
    // Se a tabela não existe, loga e retorna ID simulado
    if (err?.message?.includes('relation') || err?.message?.includes('does not exist')) {
      console.warn('[savePayrollSummary] Tabela payroll_summaries não existe. Execute a migração: 20260417230000_pre_folha_tables.sql');
      return `temp-${summary.employee_id}-${summary.period_start}`;
    }
    throw err;
  }
}

// ============ FUNÇÕES PARA MÚLTIPLOS FUNCIONÁRIOS ============

/**
 * Gera a pré-folha para todos os funcionários de uma empresa no período.
 */
export async function generateCompanyPayroll(
  companyId: string,
  startDate: string,
  endDate: string
): Promise<{ summaries: PayrollSummary[]; errors: string[] }> {
  if (!checkSupabaseConfigured()) throw new Error('Supabase não configurado.');
  
  // Validação de datas
  if (!startDate || !endDate || typeof startDate !== 'string' || typeof endDate !== 'string') {
    throw new Error('Período inválido. Datas de início e fim são obrigatórias.');
  }

  const errors: string[] = [];
  const summaries: PayrollSummary[] = [];

  // Busca funcionários ativos
  const users = await db.select('users', [
    { column: 'company_id', operator: 'eq', value: companyId },
  ]) as any[];

  const employees = (users || []).filter((u: any) => 
    u.role === 'employee' || u.role === 'hr'
  );

  for (const emp of employees) {
    try {
      // Calcula e salva o resumo
      const summary = await generatePayrollSummary(
        emp.id,
        companyId,
        startDate,
        endDate,
        true // auto-calculate
      );
      summary.employee_name = emp.nome || emp.email || 'Sem nome';
      
      await savePayrollSummary(summary);
      summaries.push(summary);
    } catch (e: any) {
      errors.push(`${emp.nome || emp.id}: ${e.message || 'Erro'}`);
    }
  }

  return { summaries, errors };
}

/**
 * Busca resumos de pré-folha já calculados.
 */
export async function getPayrollSummaries(
  companyId: string,
  startDate: string,
  endDate: string
): Promise<CalculatedPayrollRow[]> {
  if (!isSupabaseConfigured) return [];
  
  // Validação de datas
  if (!startDate || !endDate || typeof startDate !== 'string' || typeof endDate !== 'string') {
    console.warn('[getPayrollSummaries] Datas inválidas:', { startDate, endDate });
    return [];
  }

  // Busca resumos calculados
  let summaries: any[] = [];
  try {
    summaries = await db.select('payroll_summaries', [
      { column: 'company_id', operator: 'eq', value: companyId },
      { column: 'period_start', operator: 'eq', value: startDate },
      { column: 'period_end', operator: 'eq', value: endDate },
    ]) as any[];
  } catch (err: any) {
    // Se a tabela não existe, retorna array vazio
    if (err?.message?.includes('relation') || err?.message?.includes('does not exist')) {
      console.warn('[getPayrollSummaries] Tabela payroll_summaries não existe. Execute a migração.');
      return [];
    }
    throw err;
  }

  if (summaries?.length > 0) {
    // Busca nomes dos funcionários
    const employeeIds = summaries.map(s => s.employee_id);
    const users = await db.select('users', [
      { column: 'company_id', operator: 'eq', value: companyId },
    ]) as any[];

    const userMap = new Map((users || []).map((u: any) => [u.id, u]));

    return summaries.map(s => {
      const user = userMap.get(s.employee_id);
      return {
        employee_id: s.employee_id,
        employee_name: user?.nome || user?.email || 'Sem nome',
        email: user?.email,
        worked_hours: Math.round((s.total_worked_minutes / 60) * 100) / 100,
        expected_hours: Math.round((s.total_expected_minutes / 60) * 100) / 100,
        overtime_hours: Math.round((s.total_overtime_minutes / 60) * 100) / 100,
        absence_hours: Math.round((s.total_absence_minutes / 60) * 100) / 100,
        night_hours: Math.round((s.total_night_minutes / 60) * 100) / 100,
        late_hours: Math.round((s.total_late_minutes / 60) * 100) / 100,
        work_days: s.total_work_days || 0,
        absence_days: s.total_absence_days || 0,
      };
    });
  }

  return [];
}

/**
 * Marca um resumo como exportado.
 */
export async function markAsExported(
  summaryId: string,
  notes?: string
): Promise<void> {
  if (!isSupabaseConfigured) return;
  
  await db.update('payroll_summaries', summaryId, {
    status: 'exported',
    exported_at: new Date().toISOString(),
    notes: notes || null,
  });
}

// ============ UTILITÁRIOS ============

/**
 * Converte minutos para formato de horas (ex: 480 -> "08:00").
 */
export function minutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Converte minutos para horas decimais (ex: 480 -> 8.00).
 */
export function minutesToDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Retorna o intervalo de datas de um mês.
 */
export function getMonthPeriod(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}
