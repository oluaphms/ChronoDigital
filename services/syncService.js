/**
 * Sincronização periódica: SQLite local (`time_records`) → Supabase via RPC `rep_ingest_punch`.
 * - Não marca `synced` se a rede falhar ou o RPC retornar erro (retry no próximo ciclo).
 * - Duplicata NSR / já importado: marca como sincronizado localmente (idempotente).
 * - `time_records` no Postgres não aceita UPDATE (Portaria 671); não usar upsert com ON CONFLICT UPDATE.
 *
 * Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLOCK_AGENT_SQLITE_PATH (mesmo ficheiro da fila offline).
 */

import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const BATCH_SIZE = 100;
const DEFAULT_INTERVAL_MS = 15000;

const LOCAL_TIME_RECORDS_SCHEMA = `
CREATE TABLE IF NOT EXISTS time_records (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL,
  rep_id TEXT NOT NULL,
  nsr INTEGER,
  p_pis TEXT,
  p_cpf TEXT,
  p_matricula TEXT,
  p_data_hora TEXT NOT NULL,
  p_tipo_marcacao TEXT NOT NULL DEFAULT 'E',
  p_raw_data TEXT,
  synced INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
  synced_at TEXT,
  sync_attempts INTEGER NOT NULL DEFAULT 0,
  last_sync_error TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_records_rep_nsr ON time_records(rep_id, nsr) WHERE nsr IS NOT NULL;
`;

function ensureLocalSchema(db) {
  db.exec(LOCAL_TIME_RECORDS_SCHEMA);
  const cols = db.prepare(`PRAGMA table_info(time_records)`).all();
  const names = new Set((cols || []).map((c) => c.name));
  if (!names.has('sync_attempts')) {
    try {
      db.exec(`ALTER TABLE time_records ADD COLUMN sync_attempts INTEGER NOT NULL DEFAULT 0`);
    } catch {
      /* ignore */
    }
  }
  if (!names.has('last_sync_error')) {
    try {
      db.exec(`ALTER TABLE time_records ADD COLUMN last_sync_error TEXT`);
    } catch {
      /* ignore */
    }
  }
}

function isUuidLike(s) {
  if (!s || typeof s !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

function unwrapRpc(data) {
  if (data == null) return {};
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
    const o = data[0];
    if (o.rep_ingest_punch && typeof o.rep_ingest_punch === 'object') return o.rep_ingest_punch;
    return o;
  }
  if (typeof data === 'object') return data;
  return {};
}

/**
 * @param {{ sqliteDbPath: string; supabaseUrl: string; serviceRoleKey: string; intervalMs?: number }} opts
 * @returns {{ stop: () => void }}
 */
export function startSyncService(opts) {
  const intervalMs = Math.max(5000, opts.intervalMs ?? DEFAULT_INTERVAL_MS);
  const supabase = createClient(opts.supabaseUrl, opts.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  mkdirSync(dirname(opts.sqliteDbPath), { recursive: true });
  const db = new Database(opts.sqliteDbPath);
  db.pragma('journal_mode = WAL');
  ensureLocalSchema(db);

  let stopped = false;

  async function syncWithSupabase() {
    if (stopped) return;
    console.log('[SYNC] Iniciando...');
    let registros = [];
    try {
      registros = db
        .prepare(
          `SELECT id, company_id, rep_id, nsr, p_pis, p_cpf, p_matricula, p_data_hora, p_tipo_marcacao, p_raw_data
           FROM time_records WHERE synced = 0 ORDER BY p_data_hora ASC LIMIT ?`
        )
        .all(BATCH_SIZE);
    } catch (e) {
      console.error('[SYNC] Erro ao ler SQLite:', e instanceof Error ? e.message : e);
      return;
    }

    if (!registros.length) {
      console.log('[SYNC] Nenhum registro pendente');
      return;
    }

    console.log(`[SYNC] ${registros.length} pendente(s) na fila local → RPC rep_ingest_punch (idempotente; não usar upsert direto em rep_punch_logs)`);

    const markSynced = db.prepare(
      `UPDATE time_records SET synced = 1, synced_at = ?, last_sync_error = NULL, sync_attempts = 0 WHERE id = ?`
    );
    const markFailed = db.prepare(
      `UPDATE time_records SET sync_attempts = sync_attempts + 1, last_sync_error = ? WHERE id = ? AND synced = 0`
    );

    let okCount = 0;
    let retryCount = 0;
    for (const r of registros) {
      if (stopped) break;
      let rawObj = {};
      try {
        rawObj = r.p_raw_data ? JSON.parse(r.p_raw_data) : {};
      } catch {
        rawObj = {};
      }

      try {
        const { data, error } = await supabase.rpc('rep_ingest_punch', {
          p_company_id: r.company_id,
          p_rep_device_id: isUuidLike(r.rep_id) ? r.rep_id : null,
          p_pis: r.p_pis || null,
          p_cpf: r.p_cpf || null,
          p_matricula: r.p_matricula || null,
          p_nome_funcionario: null,
          p_data_hora: r.p_data_hora,
          p_tipo_marcacao: r.p_tipo_marcacao || 'E',
          p_nsr: r.nsr != null ? Number(r.nsr) : null,
          p_raw_data: { ...rawObj, local_sync: true },
          p_only_staging: false,
          p_apply_schedule: false,
        });

        if (error) {
          const msg = error.message || String(error);
          console.error('[SYNC] erro RPC:', msg);
          markFailed.run(msg.slice(0, 2000), r.id);
          retryCount += 1;
          continue;
        }

        const result = unwrapRpc(data);
        if (result.duplicate === true) {
          markSynced.run(new Date().toISOString(), r.id);
          okCount += 1;
          console.log('[SYNC] duplicata NSR já na nuvem — marcado ok local', r.id);
          continue;
        }
        if (result.user_not_found === true) {
          console.log(
            `[SYNC] sem colaborador para id=${r.id} (mantém synced=0 até cadastro; não incrementa attempts)`
          );
          continue;
        }
        if (result.success === true) {
          markSynced.run(new Date().toISOString(), r.id);
          okCount += 1;
          continue;
        }

        const errMsg = typeof result.error === 'string' ? result.error : JSON.stringify(result).slice(0, 200);
        console.error('[SYNC] RPC não concluído:', errMsg || 'resposta inválida');
        markFailed.run((errMsg || 'resposta inválida').slice(0, 2000), r.id);
        retryCount += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[SYNC] erro:', msg);
        markFailed.run(msg.slice(0, 2000), r.id);
        retryCount += 1;
      }
    }

    console.log(`[SYNC] ciclo concluído — ok: ${okCount}/${registros.length} | retry/registrado: ${retryCount}`);
  }

  const t0 = setInterval(() => {
    syncWithSupabase().catch((e) => console.error('[SYNC] Erro no ciclo:', e instanceof Error ? e.message : e));
  }, intervalMs);

  void syncWithSupabase().catch((e) => console.error('[SYNC] Erro na primeira execução:', e instanceof Error ? e.message : e));

  return {
    stop: () => {
      stopped = true;
      clearInterval(t0);
      try {
        db.close();
      } catch {
        /* ignore */
      }
    },
  };
}
