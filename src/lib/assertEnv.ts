import { showFatalError } from './supabaseInfraGuard';

type EnvShape = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
};

function readRuntimeEnv(): EnvShape {
  if (typeof window === 'undefined') return {};
  return (window as any).ENV || {};
}

function trimKey(v: unknown): string {
  return String(v ?? '').trim();
}

function trimUrl(v: unknown): string {
  return String(v ?? '')
    .trim()
    .replace(/\/+$/, '');
}

/**
 * Fonte única de URL/key: combina Vite (build), window.ENV (ex.: /env-config.js) e
 * valores injetados pelo AppInitializer em __VITE_* — evita URL “vazia” por ordem errada.
 */
export function assertEnv(): { url: string; key: string } {
  if (typeof window !== 'undefined' && (window as any).__ENV_FATAL_ERROR) {
    throw new Error(String((window as any).__ENV_FATAL_ERROR));
  }
  const runtime = readRuntimeEnv();
  const w = typeof window !== 'undefined' ? (window as any) : null;
  const viteUrl = trimUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const viteKey = trimKey(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);
  const envUrl = trimUrl(runtime.SUPABASE_URL);
  const envKey = trimKey(runtime.SUPABASE_ANON_KEY);
  const injectedUrl = trimUrl(w?.__VITE_SUPABASE_URL);
  const injectedKey = trimKey(w?.__VITE_SUPABASE_ANON_KEY);

  /*
   * O AppInitializer grava um par válido em __VITE_* após mesclar `window.ENV.SUPABASES`.
   * Se `vite*` e esse par divergirem (projeto A no .env, projeto B no runtime), usar Vite primeiro
   * fazia o GoTrue autenticar no projeto **errado** enquanto o log mostrava a URL “certa”.
   * Par injectado só vale quando URL **e** chave existem (evita misturar metade).
   */
  const useInjectedPair = !!(injectedUrl && injectedKey);
  const url = useInjectedPair ? injectedUrl : viteUrl || envUrl || injectedUrl;
  const key = useInjectedPair ? injectedKey : viteKey || envKey || injectedKey;

  if (!url || !key) {
    console.error('[ENV ERROR] Supabase não configurado corretamente');
    showFatalError('Supabase não configurado. Configure .env (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY) ou window.ENV.');
    throw new Error('[ENV] Supabase NAO configurado (URL/KEY vazios)');
  }

  return { url, key };
}

