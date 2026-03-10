import React from 'react';
import { i18n } from '../../lib/i18n';

export type Language = 'pt-BR' | 'en-US';

export interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
}

/**
 * Implementação sem React hooks para evitar conflitos de múltiplas cópias de React
 * em ambientes onde isso esteja ocorrendo. O idioma é lido/grava diretamente no
 * localStorage e aplicado via i18n, sem depender de estado React.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Garante linguagem padrão aplicada no primeiro render
  if (typeof window !== 'undefined') {
    const saved = (localStorage.getItem('smartponto_language') as Language) || 'pt-BR';
    i18n.setLanguage(saved === 'pt-BR' || saved === 'en-US' ? saved : 'pt-BR');
  } else {
    i18n.setLanguage('pt-BR');
  }

  return <>{children}</>;
}

export function useLanguage(): LanguageContextValue {
  const lang =
    (typeof window !== 'undefined' &&
      ((localStorage.getItem('smartponto_language') as Language) || 'pt-BR')) ||
    'pt-BR';

  const setLanguage = (next: Language) => {
    try {
      localStorage.setItem('smartponto_language', next);
      i18n.setLanguage(next);
    } catch {
      // ignore storage errors
    }
  };

  return { language: lang, setLanguage };
}
