import ptBR from './locales/pt-BR.json';
import en from './locales/en.json';
import es from './locales/es.json';

const STORAGE_KEY = 'app_lang';

export type LangCode = 'pt-BR' | 'en' | 'es';

const resources: Record<LangCode, Record<string, unknown>> = {
  'pt-BR': ptBR as Record<string, unknown>,
  en: en as Record<string, unknown>,
  es: es as Record<string, unknown>,
};

function getByPath(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function getLang(): LangCode {
  if (typeof localStorage === 'undefined') return 'pt-BR';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'pt-BR' || saved === 'en' || saved === 'es') return saved;
  return 'pt-BR';
}

function setLang(code: LangCode): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // ignore
  }
}

export function getTranslations(lang: LangCode): Record<string, unknown> {
  return resources[lang] ?? resources['pt-BR'];
}

export function t(key: string, lang?: LangCode): string {
  const l = lang ?? getLang();
  const dict = getTranslations(l);
  const value = getByPath(dict, key);
  if (value !== undefined) return value;
  const fallback = getByPath(resources['pt-BR'], key);
  return fallback ?? key;
}

export { getLang, setLang, STORAGE_KEY };
export const supportedLngs: LangCode[] = ['pt-BR', 'en', 'es'];
