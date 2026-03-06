import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { i18n } from '../../lib/i18n';

export type Language = 'pt-BR' | 'en-US';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'pt-BR';
    const saved = localStorage.getItem('smartponto_language') as Language;
    return saved === 'pt-BR' || saved === 'en-US' ? saved : 'pt-BR';
  });

  useEffect(() => {
    i18n.setLanguage(language);
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('smartponto_language', lang);
    i18n.setLanguage(lang);
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      language: (typeof window !== 'undefined' && (localStorage.getItem('smartponto_language') as Language)) || 'pt-BR',
      setLanguage: (lang: Language) => {
        localStorage.setItem('smartponto_language', lang);
        i18n.setLanguage(lang);
      },
    };
  }
  return ctx;
}
