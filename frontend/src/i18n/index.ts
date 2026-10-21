import ptBR from './locales/pt-BR.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import it from './locales/it.json';
import ja from './locales/ja.json';

const STORAGE_KEY = 'app_lang';

export type LangCode = 'pt-BR' | 'en' | 'es' | 'fr' | 'de' | 'it' | 'ja';

const resources: Record<LangCode, Record<string, unknown>> = {
  'pt-BR': ptBR as Record<string, unknown>,
  en: en as Record<string, unknown>,
  es: es as Record<string, unknown>,
  fr: fr as Record<string, unknown>,
  de: de as Record<string, unknown>,
  it: it as Record<string, unknown>,
  ja: ja as Record<string, unknown>,
};

export const supportedLngs: LangCode[] = ['pt-BR', 'en', 'es', 'fr', 'de', 'it', 'ja'];

function isLangCode(value: string | null): value is LangCode {
  return !!value && (supportedLngs as string[]).includes(value);
}

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
  if (isLangCode(saved)) return saved;
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

/** Traduz label de aba do site (API ou fallback) por key/rota. */
export function translateTabLabel(
  tab: { key?: string; route?: string; label?: string },
  translate: (key: string) => string = t,
): string {
  const byKey: Record<string, string> = {
    home: 'nav.home',
    chat: 'nav.chat',
    'random-duel': 'nav.randomDuel',
    arena: 'nav.arena',
    tournaments: 'nav.tournaments',
    groups: 'nav.groups',
    ranking: 'nav.ranking',
    missions: 'nav.missions',
    'battle-pass': 'nav.battlePass',
    'redeem-code': 'nav.redeemCode',
    redeem: 'nav.redeemCode',
    drops: 'nav.drops',
    shop: 'nav.shop',
    collection: 'nav.collection',
    credits: 'nav.credit',
    credit: 'nav.credit',
    'help-support': 'nav.help',
    help: 'nav.help',
    'patch-notes': 'nav.patchNotes',
    inventory: 'nav.inventory',
    deck: 'nav.deck',
    story: 'nav.story',
    profile: 'nav.profile',
  };
  const byRoute: Record<string, string> = {
    '/': 'nav.home',
    '/chat': 'nav.chat',
    '/random-duel': 'nav.randomDuel',
    '/arena': 'nav.arena',
    '/tournaments': 'nav.tournaments',
    '/groups': 'nav.groups',
    '/ranking': 'nav.ranking',
    '/missions': 'nav.missions',
    '/battle-pass': 'nav.battlePass',
    '/redeem': 'nav.redeemCode',
    '/drops': 'nav.drops',
    '/shop': 'nav.shop',
    '/collection': 'nav.collection',
    '/credit': 'nav.credit',
    '/help': 'nav.help',
    '/patch-notes': 'nav.patchNotes',
    '/marketplace/accounts': 'nav.marketplaceAccounts',
    '/marketplace/cards': 'nav.marketplaceCards',
    '/inventory': 'nav.inventory',
    '/deck': 'nav.deck',
    '/story': 'nav.story',
    '/profile': 'nav.profile',
  };

  const i18nKey =
    (tab.key && byKey[tab.key]) ||
    (tab.route && byRoute[tab.route]) ||
    undefined;

  if (i18nKey) {
    const translated = translate(i18nKey);
    if (translated !== i18nKey) return translated;
  }
  return tab.label || tab.key || tab.route || '';
}

export { getLang, setLang, STORAGE_KEY };
