import { supabase, checkSupabaseConfigured, isSupabaseConfigured } from '../../services/supabaseClient';
import { canRetrySupabase, getCircuitBreakerCooldownMs, isDnsError, markSupabaseAsDown } from './supabaseCircuitBreaker';

export type SupabaseConnectionStatus =
  | 'ok'
  | 'dns'
  | 'network'
  | 'timeout'
  | 'offline'
  | 'circuit_breaker'
  | 'not_configured'
  | 'unknown';

export type SupabaseConnectionCheckResult = {
  ok: boolean;
  status: SupabaseConnectionStatus;
  message: string;
};

let lastFailureLogKey = '';
let lastFailureLogAt = 0;

function shouldLogFailure(logKey: string): boolean {
  const now = Date.now();
  // Evita poluir o console com o mesmo erro em loop de reconexão.
  if (lastFailureLogKey === logKey && now - lastFailureLogAt < 30000) {
    return false;
  }
  lastFailureLogKey = logKey;
  lastFailureLogAt = now;
  return true;
}

function getErrorText(error: unknown): string {
  const e = error as any;
  const parts = [e?.message, e?.details, e?.hint, e?.error?.message, e?.cause?.message]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  return parts.join(' | ');
}

function classifyFailure(error: unknown): SupabaseConnectionCheckResult {
  const text = getErrorText(error);
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (text.includes('timeout') || text.includes('tempo esgotado')) {
    return {
      ok: false,
      status: 'timeout',
      message: 'Tempo esgotado ao conectar com o servidor.',
    };
  }

  if (text.includes('err_name_not_resolved') || text.includes('name_not_resolved') || text.includes('dns')) {
    return {
      ok: false,
      status: 'dns',
      message: 'Falha de DNS ao acessar o Supabase (host não resolvido).',
    };
  }

  if (!online) {
    return {
      ok: false,
      status: 'offline',
      message: 'Sem conexão com a internet no dispositivo.',
    };
  }

  if (text.includes('failed to fetch') || text.includes('networkerror') || text.includes('typeerror')) {
    return {
      ok: false,
      status: 'network',
      message: 'Falha de rede ao acessar o Supabase.',
    };
  }

  return {
    ok: false,
    status: 'unknown',
    message: 'Não foi possível conectar ao Supabase.',
  };
}

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let delay = 500;
  let lastError: unknown;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === retries - 1) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw lastError;
}

/**
 * Verifica se a conexão com o Supabase está ativa (leitura de tabela employees).
 * Executar ao iniciar o app para detectar projeto pausado ou rede indisponível.
 */
export async function checkSupabaseConnection(): Promise<SupabaseConnectionCheckResult> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      ok: false,
      status: 'not_configured',
      message: 'Supabase não configurado.',
    };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      ok: false,
      status: 'offline',
      message: 'Sem conexão com a internet no dispositivo.',
    };
  }
  if (!canRetrySupabase()) {
    return {
      ok: false,
      status: 'circuit_breaker',
      message: `Servidor temporariamente indisponível. Nova tentativa em ${Math.ceil(
        getCircuitBreakerCooldownMs() / 1000,
      )}s.`,
    };
  }

  try {
    const { error } = await retryWithBackoff(
      () => supabase.from('users').select('id').limit(1),
      3,
    );

    if (error) throw error;

    return {
      ok: true,
      status: 'ok',
      message: 'Conectado ao Supabase.',
    };
  } catch (error) {
    if (isDnsError(error)) {
      markSupabaseAsDown();
    }
    const result = classifyFailure(error);
    const key = `${result.status}:${result.message}`;
    if (shouldLogFailure(key)) {
      console.error('[SmartPonto] Supabase connection failed', { status: result.status, error });
    }
    return result;
  }
}
