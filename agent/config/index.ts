/**
 * Configuração do agente local: env, intervalo, caminhos (sem logar segredos).
 *
 * Este módulo usa `env.ts` para validação fail-fast das variáveis críticas.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_AGENT_INTERVAL_MS } from '../queue/retryPolicy';
import { validateEnv, checkMinimallEnvForApiMode } from './env';

const __dirname = dirname(fileURLToPath(import.meta.url));

function envString(name: string, fallback = ''): string {
  return (process.env[name] || fallback).trim();
}

export interface AgentConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  /** Intervalo entre ciclos: drena fila SQLite (retry) + sync dos relógios. */
  intervalMs: number;
  /** SQLite local: fila `pending_punches`. */
  sqliteDbPath: string;
  /** Logs em JSON Lines no stdout (um objeto por linha). */
  jsonLogs: boolean;
  timeLogsTable: string;
  devicesTable: string;
  syncLogsTable: string;
  skipEspelho: boolean;
  /** API intermediária (opcional): se definida, envia via /api/punch em vez de REST direto. */
  apiBaseUrl?: string;
  apiKey?: string;
}

/**
 * Carrega e valida configuração do agente.
 *
 * REGRAS:
 * 1. Se CLOCK_AGENT_API_URL e CLOCK_AGENT_API_KEY existem → modo API (não precisa de Supabase)
 * 2. Senão → modo direto (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são OBRIGATÓRIOS)
 *
 * Em caso de variáveis obrigatórias ausentes: process.exit(1) imediato.
 */
export function loadAgentConfig(): AgentConfig {
  const apiBaseUrl = envString('CLOCK_AGENT_API_URL') || undefined;
  const apiKey = envString('CLOCK_AGENT_API_KEY') || envString('API_KEY') || undefined;
  const useApiMode = !!apiBaseUrl && !!apiKey;

  // Validar env essencial (Supabase ou API)
  const isApiModeMinimal = checkMinimallEnvForApiMode();
  
  let supabaseUrl = '';
  let serviceRoleKey = '';

  if (useApiMode || isApiModeMinimal) {
    // Modo API: validação menos rigorosa (só avisa sobre Supabase se faltar)
    const validated = validateEnv();
    supabaseUrl = validated.supabaseUrl;
    serviceRoleKey = validated.supabaseServiceRoleKey;
  } else {
    // Modo direto: SUPABASE obrigatório (fail fast)
    const validated = validateEnv();
    supabaseUrl = validated.supabaseUrl;
    serviceRoleKey = validated.supabaseServiceRoleKey;
  }

  /** Tick do agente (fila + relógios). Default 10s; mínimo 10s. Ver `agent/queue/retryPolicy.ts`. */
  const intervalMs = Math.max(
    DEFAULT_AGENT_INTERVAL_MS,
    parseInt(envString('CLOCK_AGENT_INTERVAL_MS', String(DEFAULT_AGENT_INTERVAL_MS)), 10) || DEFAULT_AGENT_INTERVAL_MS
  );
  const sqliteDbPath = envString('CLOCK_AGENT_SQLITE_PATH') || resolve(__dirname, '../data/pending.db');
  const jsonLogs = envString('CLOCK_AGENT_JSON_LOGS', '1') !== '0';

  return {
    supabaseUrl,
    serviceRoleKey,
    intervalMs,
    sqliteDbPath,
    jsonLogs,
    timeLogsTable: envString('SUPABASE_TIME_LOGS_TABLE', 'clock_event_logs'),
    devicesTable: envString('SUPABASE_DEVICES_TABLE', 'devices'),
    syncLogsTable: envString('SUPABASE_SYNC_LOGS_TABLE', 'clock_sync_logs'),
    skipEspelho: envString('CLOCK_SYNC_SKIP_ESPELHO') === '1',
    apiBaseUrl,
    apiKey,
  };
}
