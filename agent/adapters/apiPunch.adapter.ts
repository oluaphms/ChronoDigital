/**
 * Adapter para envio de batidas via API intermediária (/api/punch).
 * Alternativa ao restPostBulk direto ao Supabase.
 *
 * Vantagens:
 * - Validação centralizada no servidor
 * - Rate limiting
 * - Não expõe service_role_key no agente local
 * - Possibilidade de lógica de negócio adicional no servidor
 */

import type { PendingPunchBatch } from '../queue';
import type { AgentConfig } from '../config';

export interface ApiPunchResult {
  success: boolean;
  inserted: number;
  duplicates?: number;
  error?: string;
  partial?: boolean;
}

export interface ApiPunchAdapter {
  sendBatch(batch: PendingPunchBatch): Promise<ApiPunchResult>;
}

export function createApiPunchAdapter(cfg: AgentConfig, apiBaseUrl: string): ApiPunchAdapter {
  const apiKey = cfg.apiKey || process.env.CLOCK_AGENT_API_KEY || '';

  return {
    async sendBatch(batch: PendingPunchBatch): Promise<ApiPunchResult> {
      const punches = batch.rows.map((row, idx) => ({
        employee_id: String(row.employee_id || ''),
        occurred_at: String(row.occurred_at || new Date().toISOString()),
        event_type: String(row.event_type || 'E'),
        dedupe_hash: String(row.dedupe_hash || `fallback-${idx}-${Date.now()}`),
        raw: typeof row.raw === 'object' && row.raw !== null ? row.raw : {},
      }));

      const payload = {
        deviceId: batch.deviceId,
        companyId: batch.companyId || '',
        punches,
      };

      const res = await fetch(`${apiBaseUrl}/api/punch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        return {
          success: false,
          inserted: 0,
          error: String(data.error || `HTTP ${res.status}`),
        };
      }

      return {
        success: Boolean(data.success),
        inserted: Number(data.inserted || 0),
        duplicates: Number(data.duplicates || 0),
        partial: Boolean(data.partial),
        error: data.error ? String(data.error) : undefined,
      };
    },
  };
}

/**
 * Factory que retorna o adapter apropriado:
 * - Se CLOCK_AGENT_API_URL estiver definido: usa API intermediária
 * - Senão: usa REST direto (legacy)
 */
export function getPunchAdapter(cfg: AgentConfig, log: { log(level: string, scope: string, message: string): void }): {
  send: (batch: PendingPunchBatch) => Promise<ApiPunchResult>;
  mode: 'api' | 'direct';
} {
  const apiUrl = cfg.apiBaseUrl || process.env.CLOCK_AGENT_API_URL || '';
  const apiKey = cfg.apiKey || process.env.CLOCK_AGENT_API_KEY || '';

  if (apiUrl && apiKey) {
    const adapter = createApiPunchAdapter(cfg, apiUrl);
    log.log('info', 'agent', `Usando API intermediária: ${apiUrl}/api/punch`);
    return {
      send: (batch) => adapter.sendBatch(batch),
      mode: 'api',
    };
  }

  // Modo direto (REST PostgREST) - legacy, usa service role
  log.log('info', 'agent', 'Usando REST direto ao Supabase (modo legacy)');
  return {
    send: async () => {
      // Deve ser implementado pelo caller via restPostBulk
      throw new Error('Modo direto requer implementação via restPostBulk. Use o modo API ou implemente o envio direto.');
    },
    mode: 'direct',
  };
}
