import { showFatalError } from './supabaseInfraGuard';

type EnvShape = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
};

function readRuntimeEnv(): EnvShape {
  if (typeof window === 'undefined') return {};
  return (window as any).ENV || {};
}

export function assertEnv(): { url: string; key: string } {
  if (typeof window !== 'undefined' && (window as any).__ENV_FATAL_ERROR) {
    throw new Error(String((window as any).__ENV_FATAL_ERROR));
  }
  const runtime = readRuntimeEnv();
  const url =
    runtime.SUPABASE_URL ||
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
    '';
  const key =
    runtime.SUPABASE_ANON_KEY ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    '';

  if (!url || !key) {
    console.error('[ENV ERROR] Supabase não configurado corretamente');
    showFatalError('Supabase não configurado. Configure .env (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY) ou window.ENV.');
    throw new Error('[ENV] Supabase NAO configurado (URL/KEY vazios)');
  }

  return { url, key };
}

