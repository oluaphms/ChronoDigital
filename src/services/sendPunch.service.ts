import type { SupabaseClient } from '@supabase/supabase-js';
import { PUNCH_SOURCE_WEB, type PunchSource } from '../constants/punchSource';

/** Payload de insert em `public.punches` (campos conforme o schema no Supabase). */
export type PunchInsert = Record<string, unknown> & { source?: PunchSource | string };

/**
 * Insere uma batida na tabela `punches`.
 * `source` default `web` (app); use `clock` apenas se o insert vier do agente nesta tabela.
 * @throws PostgrestError (ou derivado) quando o Supabase retorna `error`
 */
export async function sendPunch(supabase: SupabaseClient, punch: PunchInsert): Promise<void> {
  const row = { ...punch, source: punch.source ?? PUNCH_SOURCE_WEB };
  const { error } = await supabase.from('punches').insert(row);
  if (error) throw error;
}
