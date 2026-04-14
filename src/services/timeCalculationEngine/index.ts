/**
 * Engine de cálculo trabalhista
 * Fluxo: time_records → punchInterpreter → escala → jornada → banco de horas
 */

import { db, isSupabaseConfigured } from '../../../services/supabaseClient';
import { interpretPunchSequence } from '../punchInterpreter';

export interface WorkdayCalculationResult {
  employee_id: string;
  date: string;
  company_id: string;
  horas_trabalhadas: number;
  horas_extras: number;
  atrasos: number;
  faltas: number;
  saldo_banco_horas: number;
  interpretation_status: 'normal' | 'corrigido' | 'suspeito';
  pairs: { entrada: string; saida: string }[];
}

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minutesBetween(entrada: string, saida: string): number {
  const a = new Date(entrada).getTime();
  const b = new Date(saida).getTime();
  return Math.max(0, Math.round((b - a) / (60 * 1000)));
}

/**
 * Calcula a jornada do dia para um funcionário: horas trabalhadas, extras, atrasos, faltas, banco.
 */
export async function calculateWorkday(
  employeeId: string,
  date: string,
  companyId: string
): Promise<WorkdayCalculationResult> {
  const result: WorkdayCalculationResult = {
    employee_id: employeeId,
    date,
    company_id: companyId,
    horas_trabalhadas: 0,
    horas_extras: 0,
    atrasos: 0,
    faltas: 0,
    saldo_banco_horas: 0,
    interpretation_status: 'normal',
    pairs: [],
  };

  const interpretation = await interpretPunchSequence(employeeId, date);
  result.interpretation_status = interpretation.status;
  result.pairs = interpretation.pairs;

  let totalMinutes = 0;
  for (const p of interpretation.pairs) {
    totalMinutes += minutesBetween(p.entrada, p.saida);
  }
  result.horas_trabalhadas = Math.round(totalMinutes) / 60;

  // Escala esperada (work_shifts via user -> schedule -> shift)
  const userRows = (await db.select('users', [{ column: 'id', operator: 'eq', value: employeeId }], undefined, 1)) as { schedule_id?: string }[];
  const scheduleId = userRows?.[0]?.schedule_id;
  if (!scheduleId) return result;

  const scheduleRows = (await db.select('schedules', [{ column: 'id', operator: 'eq', value: scheduleId }], undefined, 1)) as { shift_id?: string }[];
  const shiftId = scheduleRows?.[0]?.shift_id;
  if (!shiftId) return result;

  const shiftRows = (await db.select('work_shifts', [{ column: 'id', operator: 'eq', value: shiftId }], undefined, 1)) as {
    start_time?: string;
    end_time?: string;
    break_minutes?: number;
    tolerancia_entrada?: number;
    limite_horas_dia?: number;
    banco_horas?: boolean;
  }[];
  const shift = shiftRows?.[0];
  if (!shift) return result;

  const startMin = shift.start_time ? parseTimeToMinutes(shift.start_time.slice(0, 5)) : 8 * 60;
  const endMin = shift.end_time ? parseTimeToMinutes(shift.end_time.slice(0, 5)) : 17 * 60;
  const breakMin = shift.break_minutes ?? 60;
  const expectedMinutes = endMin - startMin - breakMin;
  const tolerance = shift.tolerancia_entrada ?? 10;
  const limitHours = shift.limite_horas_dia ?? 10;

  if (interpretation.pairs.length > 0) {
    const firstEntrada = interpretation.pairs[0].entrada;
    const firstMin = new Date(firstEntrada).getHours() * 60 + new Date(firstEntrada).getMinutes();
    if (firstMin > startMin + tolerance) {
      result.atrasos = (firstMin - startMin - tolerance) / 60;
    }
    const workedMinutes = totalMinutes;
    if (workedMinutes > expectedMinutes) {
      result.horas_extras = (workedMinutes - expectedMinutes) / 60;
      if (limitHours && result.horas_trabalhadas > limitHours) {
        result.horas_extras = Math.min(result.horas_extras, result.horas_trabalhadas - limitHours);
      }
    }
    if (workedMinutes < expectedMinutes && interpretation.pairs.length > 0) {
      const missing = (expectedMinutes - workedMinutes) / 60;
      if (missing >= 0.5) result.faltas = Math.round(missing / 8); // simplificado: falta se faltou ≥ 0.5h
    }
  } else {
    const dayOfWeek = new Date(date).getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      result.faltas = 1;
    }
  }

  // Saldo banco de horas (último registro da tabela bank_hours para o funcionário até a data)
  if (shift.banco_horas && isSupabaseConfigured) {
    const bankRows = (await db.select(
      'bank_hours',
      [
        { column: 'employee_id', operator: 'eq', value: employeeId },
        { column: 'date', operator: 'lte', value: date },
      ],
      { column: 'date', ascending: false },
      1
    )) as { balance?: number }[];
    result.saldo_banco_horas = bankRows?.[0]?.balance ?? 0;
  }

  return result;
}
