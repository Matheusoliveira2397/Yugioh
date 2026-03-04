import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { getLang, setLang, getTranslations, type LangCode } from './index';

type TFunction = (key: string) => string;

interface I18nContextValue {
  t: TFunction;
  language: LangCode;
  setLanguage: (code: LangCode) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LangCode>(() => getLang());

  const setLanguage = useCallback((code: LangCode) => {
    setLang(code);
    setLanguageState(code);
  }, []);

  const t = useCallback<TFunction>(
    (key: string) => {
      const dict = getTranslations(language);
      const parts = key.split('.');
      let current: unknown = dict;
      for (const part of parts) {
        if (current == null || typeof current !== 'object') break;
        current = (current as Record<string, unknown>)[part];
      }
      if (typeof current === 'string') return current;
      const fallback = getTranslations('pt-BR');
      current = fallback;
      for (const part of parts) {
        if (current == null || typeof current !== 'object') return key;
        current = (current as Record<string, unknown>)[part];
      }
      return typeof current === 'string' ? current : key;
    },
    [language],
  );

  return (
    <I18nContext.Provider value={{ t, language, setLanguage }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
