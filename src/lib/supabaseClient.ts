/**
 * ETAPA 1 - Inicialização Segura e Tardia do Supabase
 * Lazy initialization - só cria o client quando as variáveis estão disponíveis
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { canRetrySupabase, isDnsError, markSupabaseAsDown } from '../services/supabaseCircuitBreaker';
import { getSupabaseInfraFatal } from './supabaseInfraGuard';
import { assertEnv } from './assertEnv';

let supabaseInstance: SupabaseClient | null = null;
let initializationAttempted = false;

function sanitizeSupabaseUrl(rawUrl: string): string {
  return String(rawUrl || '').trim().replace(/\/+$/, '');
}

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function isOfflineDevModeEnabled(): boolean {
  return typeof window !== 'undefined' && (window as any).__SUPABASE_OFFLINE_DEV === true;
}

function isDevMode(): boolean {
  return typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;
}

function isDnsCooldownActive(): boolean {
  if (typeof window === 'undefined') return false;
  const until = Number((window as any).__SUPABASE_DNS_COOLDOWN_UNTIL || 0);
  return until > Date.now();
}

/**
 * Obter cliente Supabase com inicialização segura
 * Retorna null se as variáveis não estiverem disponíveis
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (typeof window !== 'undefined' && (window as any).__ENV_FATAL_ERROR) {
    return null;
  }
  if (getSupabaseInfraFatal()) {
    return null;
  }
  // Se já foi criado, retornar a instância
  if (supabaseInstance) {
    return supabaseInstance;
  }

  // Se já tentou e falhou, não tentar novamente
  if (initializationAttempted) {
    return null;
  }

  // Marcar que tentou
  initializationAttempted = true;

  console.log('[SUPABASE] Inicializando...');
  const env = assertEnv();
  const url = sanitizeSupabaseUrl(env.url);
  const key = env.key;

  // Validar formato da URL
  if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
    throw new Error('[SUPABASE] URL inválida');
  }

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('.supabase.co')) {
      throw new Error('[SUPABASE] Host inválido na URL');
    }
  } catch (error) {
    console.error('[SUPABASE] URL inválida (parse falhou):', url, error);
    throw error;
  }

  try {
    // Criar a instância com configuração padrão (compatível com sessões existentes)
    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: true,
        // Evita cascata de refresh automático em cenários de DNS/rede instável.
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: async (input, init) => {
          if (isOfflineDevModeEnabled()) {
            throw new Error('[OFFLINE MODE] Supabase indisponível');
          }
          if (isDevMode() && isDnsCooldownActive()) {
            throw new Error('[NETWORK] DNS indisponível (cooldown)');
          }
          if (!canRetrySupabase()) {
            throw new Error('[Supabase] Circuit breaker ativo');
          }
          if (isBrowserOffline()) {
            throw new Error('offline');
          }
          try {
            return await fetch(input, init);
          } catch (error) {
            if (isDnsError(error)) {
              console.error('[NETWORK] erro de DNS');
              markSupabaseAsDown();
              if (isDevMode() && typeof window !== 'undefined') {
                // Evita flood de requests/erros por alguns segundos em ambiente local.
                (window as any).__SUPABASE_DNS_COOLDOWN_UNTIL = Date.now() + 15000;
              }
            } else if (String((error as any)?.message || '').toLowerCase().includes('timeout')) {
              console.error('[NETWORK] erro de timeout');
            } else if (String((error as any)?.message || '').toLowerCase().includes('auth')) {
              console.error('[AUTH] erro de autenticação');
            } else {
              console.error('[NETWORK] erro de rede');
            }
            throw error;
          }
        },
      },
    });

    console.log('[SUPABASE] Cliente inicializado');
    console.log(`   URL: ${url.slice(0, 40)}...`);
    console.log(`   Key: ${key.slice(0, 20)}...`);

    return supabaseInstance;
  } catch (error) {
    console.error('[SUPABASE] Erro ao criar cliente:', error);
    return null;
  }
}

/**
 * Obter cliente Supabase com garantia (lança erro se não conseguir)
 */
export function getSupabaseClientOrThrow(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      'Supabase não inicializado. Verifique se VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estão definidas.'
    );
  }
  return client;
}

/**
 * Resetar a instância (útil para testes)
 */
export function resetSupabaseClient(): void {
  supabaseInstance = null;
  initializationAttempted = false;
}

/**
 * Resetar a sessão de autenticação
 */
export async function resetSession(): Promise<void> {
  const client = getSupabaseClient();
  if (client) {
    await client.auth.signOut();
  }
}

// Timeout padrão para operações
export const DEFAULT_CONNECTION_TIMEOUT_MS = 10000;
export const DB_SELECT_TIMEOUT_MS = 28000;

/**
 * Testa se o Supabase está acessível
 */
export async function testSupabaseConnection(
  timeoutMs: number = DEFAULT_CONNECTION_TIMEOUT_MS,
): Promise<{ ok: boolean; message?: string }> {
  const client = getSupabaseClient();
  
  if (!client) {
    return { 
      ok: false, 
      message: 'Supabase não inicializado. Verifique as variáveis de ambiente.' 
    };
  }

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), timeoutMs),
  );

  const tablesToTry = ['users', 'employees', 'companies'] as const;
  
  for (const table of tablesToTry) {
    try {
      const queryPromise = client.from(table).select('*').limit(1);
      const { error } = await Promise.race([queryPromise, timeoutPromise]);
      
      if (error && error.code !== 'PGRST116') {
        continue;
      }
      
      console.log('[SmartPonto] Supabase conectado (tabela:', table, ')');
      return { ok: true };
    } catch (e: any) {
      if (e?.message === 'timeout') {
        return {
          ok: false,
          message: 'Supabase timeout. Projeto pode estar pausado ou rede lenta.',
        };
      }
    }
  }

  return {
    ok: false,
    message: 'Não foi possível conectar ao Supabase.',
  };
}

/**
 * Executa uma promise do Supabase com timeout
 */
export async function withSupabaseTimeout<T>(
  promise: Promise<{ data: T; error: any }>,
  ms: number = DEFAULT_CONNECTION_TIMEOUT_MS,
): Promise<{ data: T; error: any }> {
  return Promise.race([
    promise,
    new Promise<{ data: null; error: { message: string } }>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Supabase timeout (${ms}ms)`)),
        ms,
      ),
    ),
  ]);
}
