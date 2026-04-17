/**
 * Configuração REST (service role) para o agente — chave só em memória, nunca em log.
 */

import type { SupabaseRestConfig } from '../../src/services/supabaseRest';

export function createSupabaseRestConfig(url: string, serviceRoleKey: string): SupabaseRestConfig {
  return {
    url: url.replace(/\/$/, ''),
    serviceKey: serviceRoleKey,
  };
}
