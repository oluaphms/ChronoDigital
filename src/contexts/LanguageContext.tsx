import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { i18n } from '../../lib/i18n';

export type Language = 'pt-BR' | 'en-US';

export interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export function getDefaultLanguage(): Language {
  if (typeof window === 'undefined') return 'pt-BR';
  const saved = localStorage.getItem('smartponto_language') as Language;
  return saved === 'pt-BR' || saved === 'en-US' ? saved : 'pt-BR';
}

export const LanguageContext = createContext<LanguageContextValue>({
  language: getDefaultLanguage(),
  setLanguage: () => {},
});

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      language: getDefaultLanguage(),
      setLanguage: (lang: Language) => {
        i18n.setLanguage(lang);
        localStorage.setItem('smartponto_language', lang);
      },
    };
  }
  return ctx;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => getDefaultLanguage());

  useEffect(() => {
    i18n.setLanguage(language);
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    const next = lang === 'pt-BR' || lang === 'en-US' ? lang : 'pt-BR';
    setLanguageState(next);
    i18n.setLanguage(next);
    localStorage.setItem('smartponto_language', next);
  }, []);

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
