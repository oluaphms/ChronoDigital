/**
 * Retry inteligente da fila SQLite: backoff exponencial com teto (nunca descartar linhas).
 *
 * - Tick do agente: `CLOCK_AGENT_INTERVAL_MS` (default 10s) — oportunidade de reenvio.
 * - Após cada falha de envio: próximo `nextRetryAt` = agora + delay (10s → 20s → 40s → … até 60s).
 * - Dados: apenas INSERT e UPDATE (`synced`); nunca DELETE em `pending_punches`.
 */

/** Intervalo default do agente (ms): flush + sync. */
export const DEFAULT_AGENT_INTERVAL_MS = 10_000;

/** Base do backoff após falha (ms), alinhada ao tick. */
export const RETRY_BACKOFF_BASE_MS = 10_000;

/** Teto do delay entre retentativas da mesma linha (1 min). */
export const RETRY_BACKOFF_MAX_MS = 60_000;

/** Jitter proporcional ao delay (máx. 500 ms). */
export function backoffDelayMs(attemptsAfterFailure: number): number {
  const exp = Math.max(0, attemptsAfterFailure - 1);
  const raw = RETRY_BACKOFF_BASE_MS * 2 ** exp;
  const capped = Math.min(RETRY_BACKOFF_MAX_MS, raw);
  const jitter = Math.floor(Math.random() * Math.min(500, Math.max(50, Math.floor(capped * 0.08))));
  return capped + jitter;
}

export function nextRetryIsoFromNow(attemptsAfterFailure: number): string {
  return new Date(Date.now() + backoffDelayMs(attemptsAfterFailure)).toISOString();
}
