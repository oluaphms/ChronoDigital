/**
 * Acesso centralizado à tabela `time_records` (Supabase).
 * Padrão: retornar dados; em erro de PostgREST, lançar `Error` com mensagem clara.
 */

import { getSupabaseClientOrThrow } from '../src/lib/supabaseClient';
import { db, type Filter } from './supabaseClient';

type DbSelectArg2 = Parameters<typeof db.select>[2];
type DbSelectArg3 = Parameters<typeof db.select>[3];

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

/** Mesmo pipeline que `db.select` (sessão + RLS + timeout interno). */
export async function listTimeRecords(
  filters: Filter[],
  orderOrOptions?: DbSelectArg2,
  limit?: DbSelectArg3,
): Promise<any[]> {
  return db.select('time_records', filters, orderOrOptions, limit);
}

export async function getTimeRecordsByUser(userId: string, limit = 50, offset = 0): Promise<any[]> {
  const { data, error } = await getSupabaseClientOrThrow()
    .from('time_records')
    .select('id, user_id, type, method, created_at, location, company_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  throwIfError(error, 'getTimeRecordsByUser');
  return data ?? [];
}

export async function getTimeRecordsByCompany(companyId: string, limit = 50, offset = 0): Promise<any[]> {
  const { data, error } = await getSupabaseClientOrThrow()
    .from('time_records')
    .select('id, user_id, type, created_at, company_id')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  throwIfError(error, 'getTimeRecordsByCompany');
  return data ?? [];
}

export async function getTimeRecordsByDateForUser(userId: string, date: string): Promise<any[]> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const { data, error } = await getSupabaseClientOrThrow()
    .from('time_records')
    .select('id, user_id, type, created_at, location, method')
    .eq('user_id', userId)
    .gte('created_at', startOfDay.toISOString())
    .lte('created_at', endOfDay.toISOString())
    .order('created_at', { ascending: true });
  throwIfError(error, 'getTimeRecordsByDateForUser');
  return data ?? [];
}

export async function countTimeRecordsByUser(userId: string): Promise<number> {
  const { count, error } = await getSupabaseClientOrThrow()
    .from('time_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  throwIfError(error, 'countTimeRecordsByUser');
  return count ?? 0;
}

/** Faixa `created_at` inclusive (strings ISO locais do dia, como em `getDayRecords`). */
export async function getTimeRecordsForUserDayRange(
  userId: string,
  startInclusive: string,
  endInclusive: string,
): Promise<any[]> {
  return db.select(
    'time_records',
    [
      { column: 'user_id', operator: 'eq', value: userId },
      { column: 'created_at', operator: 'gte', value: startInclusive },
      { column: 'created_at', operator: 'lte', value: endInclusive },
    ],
    { column: 'created_at', ascending: true },
  );
}

/** Histórico recente para validação antifraude no registro de ponto. */
export async function getRecentTimeRecordsForUser(userId: string, limit = 50): Promise<any[]> {
  return db.select(
    'time_records',
    [{ column: 'user_id', operator: 'eq', value: userId }],
    {
      columns: 'id, type, timestamp, created_at, latitude, longitude, device_id',
      orderBy: { column: 'created_at', ascending: false },
      limit,
    },
  );
}

export async function getTimeRecordsForEmployeeDashboard(userId: string): Promise<any[]> {
  return db.select('time_records', [{ column: 'user_id', operator: 'eq', value: userId }], {
    columns: 'id, user_id, company_id, type, method, created_at, timestamp, source, origin',
    limit: 120,
  });
}

export async function createTimeRecord(row: Record<string, unknown>): Promise<void> {
  const { error } = await getSupabaseClientOrThrow().from('time_records').insert(row);
  throwIfError(error, 'createTimeRecord');
}

/** Consolidação REP → espelho: localiza batida já gravada pelo NSR (mesmo critério que `RepDevices.tsx`). */
export async function findTimeRecordIdByCompanySourceNsr(
  companyId: string,
  nsr: number,
): Promise<string | null> {
  const { data, error } = await getSupabaseClientOrThrow()
    .from('time_records')
    .select('id')
    .eq('company_id', companyId)
    .eq('source', 'rep')
    .eq('nsr', nsr)
    .limit(1)
    .maybeSingle();
  throwIfError(error, 'findTimeRecordIdByCompanySourceNsr');
  return data && typeof (data as { id?: string }).id === 'string' ? (data as { id: string }).id : null;
}

export async function updateTimeRecord(id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await getSupabaseClientOrThrow().from('time_records').update(patch).eq('id', id);
  throwIfError(error, 'updateTimeRecord');
}

export async function deleteTimeRecord(id: string): Promise<void> {
  const { error } = await getSupabaseClientOrThrow().from('time_records').delete().eq('id', id);
  throwIfError(error, 'deleteTimeRecord');
}

/** Ajuste de horário aprovado (espelho): atualiza instante oficial da batida. */
export async function updateTimeRecordPunchInstant(
  id: string,
  newCreatedAtIso: string,
  updatedAtIso: string,
): Promise<void> {
  const { error } = await getSupabaseClientOrThrow()
    .from('time_records')
    .update({ created_at: newCreatedAtIso, updated_at: updatedAtIso })
    .eq('id', id);
  throwIfError(error, 'updateTimeRecordPunchInstant');
}

export type InsertAdminMirrorResult = { id: string; createdAt: string };

/**
 * Inclusão de batida pelo espelho admin: tenta RPC `insert_time_record_for_user`;
 * se não retornar `record_id`, faz insert direto (mesma lógica que `Timesheet.tsx`).
 */
export async function insertAdminMirrorTimeRecord(
  data: Record<string, unknown>,
  companyId: string,
): Promise<InsertAdminMirrorResult> {
  const userId = String(data.user_id ?? '');
  const type = String(data.type ?? '');
  const createdAt = String(data.created_at ?? '');
  if (!userId || !type || !createdAt) {
    throw new Error('insertAdminMirrorTimeRecord: user_id, type e created_at são obrigatórios.');
  }

  const sb = getSupabaseClientOrThrow();
  const { data: rpcData, error: rpcError } = await sb.rpc('insert_time_record_for_user', {
    p_user_id: userId,
    p_company_id: companyId,
    p_type: type,
    p_method: 'admin',
    p_source: 'admin',
    p_timestamp: createdAt,
    p_latitude: (data.latitude as number | null | undefined) ?? null,
    p_longitude: (data.longitude as number | null | undefined) ?? null,
    p_manual_reason: (data.manual_reason as string | null | undefined) ?? null,
  });

  if (!rpcError && rpcData && typeof rpcData === 'object' && rpcData !== null && 'record_id' in rpcData) {
    const r = rpcData as { record_id: string; timestamp?: string | number | null };
    const id = String(r.record_id);
    let createdIso = createdAt;
    if (typeof r.timestamp === 'string') {
      createdIso = r.timestamp;
    } else if (r.timestamp != null && (typeof r.timestamp === 'number' || typeof r.timestamp === 'object')) {
      createdIso = new Date(r.timestamp as number | Date).toISOString();
    }
    return { id, createdAt: createdIso };
  }

  if (rpcError && typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    console.warn('[timeRecords.service] insert_time_record_for_user:', rpcError);
  }

  const mergeId = crypto.randomUUID();
  await createTimeRecord({
    ...data,
    id: mergeId,
    company_id: companyId,
    is_manual: true,
    method: 'admin',
  });
  return { id: mergeId, createdAt };
}
