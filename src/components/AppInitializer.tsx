/**
 * ETAPA 2 - Bloqueio de Execução Prematura
 * Garante que o app só renderiza quando as variáveis de ambiente estão carregadas
 */

import React, { useEffect, useRef, useState } from 'react';
import { showFatalError, setSupabaseInfraFatal } from '../lib/supabaseInfraGuard';
import { validateSupabaseUrl } from '../lib/validateSupabaseUrl';
import { assertEnv } from '../lib/assertEnv';
import { checkSupabaseConnection } from '../services/checkSupabaseConnection';

interface AppInitializerProps {
  children: React.ReactNode;
}

export const AppInitializer: React.FC<AppInitializerProps> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initStartedRef = useRef(false);

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    let mounted = true;
    const init = async () => {
      const envName =
        (typeof window !== 'undefined' && (window as any).ENV?.ENVIRONMENT) || 'dev';
      const envMap =
        (typeof window !== 'undefined' && (window as any).ENV?.SUPABASES) || {};
      const envConfig = envMap?.[envName] || null;

      let supabaseUrl = '';
      let supabaseKey = '';
      try {
        const env = assertEnv();
        supabaseUrl = envConfig?.url || env.url;
        supabaseKey = envConfig?.key || env.key;
      } catch (error: any) {
        const message = error?.message || '[ENV] Variáveis ausentes';
        setSupabaseInfraFatal(message);
        if (mounted) setError(message);
        return;
      }

      if (typeof window !== 'undefined') {
        (window as any).__VITE_SUPABASE_URL = supabaseUrl;
        (window as any).__VITE_SUPABASE_ANON_KEY = supabaseKey;
      }

      if (typeof console !== 'undefined') {
        console.group('[ENV]');
        console.log('Environment:', envName);
        console.log('URL:', supabaseUrl);
        console.log('Online:', typeof navigator === 'undefined' ? true : navigator.onLine);
        console.groupEnd();
      }

      if (!supabaseUrl || !supabaseKey) {
        const message = '[ENV] Variáveis ausentes';
        setSupabaseInfraFatal(message);
        showFatalError('Variáveis do Supabase ausentes. Verifique o ambiente ativo.');
        if (mounted) setError(message);
        return;
      }

      if (!validateSupabaseUrl(supabaseUrl)) {
        const message = '[ENV] SUPABASE_URL inválida';
        setSupabaseInfraFatal(message);
        showFatalError('SUPABASE_URL inválida. Ajuste a configuração de ambiente.');
        if (mounted) setError(message);
        return;
      }

      if (typeof window !== 'undefined') {
        (window as any).__SUPABASE_OFFLINE_DEV = false;
      }
      if (mounted) setIsReady(true);

      // Diagnóstico não bloqueante: resultado apenas informativo — nunca bloqueia login.
      void (async () => {
        const result = await checkSupabaseConnection();
        if (!result.ok) {
          console.warn('[SUPABASE] modo degradado ativo:', result.message, '— o login continuará funcionando.');
        }
      })();
    };

    void init();

    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#f3f4f6',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            padding: '2rem',
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            maxWidth: '500px',
          }}
        >
          <h1 style={{ color: '#dc2626', marginBottom: '1rem' }}>❌ Erro de Configuração</h1>
          <p style={{ color: '#666', marginBottom: '1rem' }}>{error}</p>
          <p style={{ color: '#999', fontSize: '0.875rem' }}>
            Verifique o console do navegador (F12) para mais detalhes.
          </p>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#f3f4f6',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            padding: '2rem',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '4px solid #e5e7eb',
              borderTop: '4px solid #4f46e5',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem',
            }}
          />
          <p style={{ color: '#666' }}>Carregando configuração...</p>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
