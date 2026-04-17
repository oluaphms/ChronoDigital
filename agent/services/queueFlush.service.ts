/**
 * Drena a fila offline (SQLite): POST em lote via API intermediária ou REST direto.
 *
 * Modo API (recomendado): envia para /api/punch com validação centralizada.
 * Modo direto (legacy): REST PostgREST direto ao Supabase.
 */

import type { AgentConfig } from '../config';
import { OfflineQueue } from '../queue';
import type { PendingPunchBatch } from '../queue';
import { createSupabaseRestConfig } from '../adapters/supabase.adapter';
import { restPostBulk } from '../../src/services/supabaseRest';
import { promoteClockEventsToEspelho } from '../../src/services/clockEventPromote.service';
import type { AgentLogger } from './agentLogger';
import { getPunchAdapter, type ApiPunchResult } from '../adapters/apiPunch.adapter';

export interface FlushResult {
  attempted: number;
  succeeded: number;
  failed: number;
  viaApi: number;
  viaDirect: number;
}

export async function flushOfflineQueue(
  cfg: AgentConfig,
  queue: OfflineQueue,
  log: AgentLogger
): Promise<FlushResult> {
  const batches = await queue.listReadyBatches();
  let succeeded = 0;
  let failed = 0;
  let viaApi = 0;
  let viaDirect = 0;

  // Detectar modo: API ou direto
  const useApi = !!cfg.apiBaseUrl && !!cfg.apiKey;
  const punchAdapter = useApi ? getPunchAdapter(cfg, log) : null;

  for (const batch of batches) {
    let result: ApiPunchResult;

    if (punchAdapter && punchAdapter.mode === 'api') {
      // Modo API intermediária
      result = await punchAdapter.send(batch);
      viaApi++;
    } else {
      // Modo direto (REST PostgREST)
      result = await flushOneBatchDirect(cfg, batch, log);
      viaDirect++;
    }

    if (result.success) {
      succeeded++;
      await queue.markSyncedMany(batch.ids);
      log.sendOk(result.inserted, {
        duplicates: result.duplicates || 0,
        ids: batch.ids.length,
        rows: batch.rows.length,
        via: punchAdapter?.mode || 'direct',
      }, batch.deviceId);
    } else {
      failed++;
      const msg = result.error || 'Erro desconhecido';
      for (const id of batch.ids) {
        await queue.rescheduleFailed(id, msg);
        log.retryScheduled(id, 1, 'next cycle', batch.deviceId);
      }
      log.sendError(msg, { batchIds: batch.ids.length, via: punchAdapter?.mode || 'direct' }, batch.deviceId);
    }
  }

  if (batches.length > 0) {
    log.queueProcessed(batches.length, succeeded, failed);
  }

  return { attempted: batches.length, succeeded, failed, viaApi, viaDirect };
}

/**
 * Envio direto via REST PostgREST (modo legacy).
 * Mantém compatibilidade com deploys existentes.
 */
async function flushOneBatchDirect(
  cfg: AgentConfig,
  batch: PendingPunchBatch,
  log: AgentLogger
): Promise<ApiPunchResult> {
  const rest = createSupabaseRestConfig(cfg.supabaseUrl, cfg.serviceRoleKey);
  const deviceId = batch.deviceId;

  try {
    await restPostBulk(rest, batch.timeLogsTable, batch.rows);

    // Promoção espelho (opcional)
    if (!cfg.skipEspelho && batch.companyId) {
      try {
        await promoteClockEventsToEspelho(rest, {
          timeLogsTable: batch.timeLogsTable,
          companyId: batch.companyId,
          deviceId,
          batchSize: 200,
          maxBatches: 150,
        });
      } catch (pe) {
        const m = pe instanceof Error ? pe.message : String(pe);
        log.warn('Espelho (time_records) falhou, será retentado', { error: m, batchIds: batch.ids.length }, deviceId);
      }
    }

    return { success: true, inserted: batch.rows.length, duplicates: 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, inserted: 0, error: msg };
  }
}
