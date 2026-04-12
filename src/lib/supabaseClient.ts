/**
 * ETAPA 1 - Inicialização Segura e Tardia do Supabase
 * Lazy initialization - só cria o client quando as variáveis estão disponíveis
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let initializationAttempted = false;

/**
 * Obter cliente Supabase com inicialização segura
 * Retorna null se as variáveis não estiverem disponíveis
 */
export function getSupabaseClient(): SupabaseClient | null {
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

  // Tentar ler as variáveis de múltiplas fontes
  const url =
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
    (typeof window !== 'undefined' && (window as any).__VITE_SUPABASE_URL) ||
    (typeof window !== 'undefined' && (window as any).ENV?.SUPABASE_URL) ||
    '';

  const key =
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    (typeof window !== 'undefined' && (window as any).__VITE_SUPABASE_ANON_KEY) ||
    (typeof window !== 'undefined' && (window as any).ENV?.SUPABASE_ANON_KEY) ||
    '';

  // Validar se as variáveis estão disponíveis
  if (!url || !key) {
    console.error(
      '❌ [Supabase] Variáveis de ambiente não carregadas ainda.',
      { url: !!url, key: !!key }
    );
    return null;
  }

  // Validar formato da URL
  if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
    console.error('❌ [Supabase] URL inválida:', url);
    return null;
  }

  try {
    // Criar a instância
    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

    console.log('✅ [Supabase] Cliente inicializado com sucesso');
    console.log(`   URL: ${url.slice(0, 40)}...`);
    console.log(`   Key: ${key.slice(0, 20)}...`);

    return supabaseInstance;
  } catch (error) {
    console.error('❌ [Supabase] Erro ao criar cliente:', error);
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
