/**
 * Fila offline em SQLite (`pending_punches`).
 */

export type PendingPunchSource = 'clock' | 'web';

/** Metadados de envio/retry guardados em `context_json` (coluna adicional no SQLite). */
export interface PendingPunchContext {
  attempts: number;
  /** ISO — quando reenviar */
  nextRetryAt: string;
  timeLogsTable: string;
  deviceId: string;
  companyId: string | null;
  /** Linha completa para POST em `clock_event_logs` (PostgREST). */
  row: Record<string, unknown>;
  lastError?: string;
}

/**
 * Lote agrupado para um único `restPostBulk` (mesmo device/tabela).
 * Usado internamente pelo flush.
 */
export interface PendingPunchBatch {
  ids: string[];
  timeLogsTable: string;
  deviceId: string;
  companyId: string | null;
  rows: Record<string, unknown>[];
}
