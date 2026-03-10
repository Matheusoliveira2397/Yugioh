/**
 * Base URL da API (backend). Em produção deve ser definida VITE_API_URL.
 */
function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL;
  if (env && typeof env === 'string' && env.trim() !== '') return env.trim();
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'http://localhost:3000';
}

/**
 * Base URL para imagens (uploads, avatares). Em produção com proxy (/api),
 * imagens costumam ser servidas no mesmo origin (ex: /avatars/, /uploads/).
 */
function getImageBaseUrl(): string {
  if (typeof window === 'undefined') return getApiBaseUrl();
  const env = import.meta.env.VITE_API_URL;
  const isProd = import.meta.env.PROD;
  if (isProd && env && typeof env === 'string' && env.trim().startsWith('/')) {
    return window.location.origin;
  }
  return getApiBaseUrl();
}

export function getImageUrl(
  url: string | null | undefined,
  defaultUrl = '/images/default.png',
): string {
  if (!url) return defaultUrl;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = getImageBaseUrl();
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * URL para cosméticos (playmat, sleeve do oponente). Retorna URL absoluta ou undefined se não houver.
 * Em produção usa VITE_API_URL; se não definida, usa o mesmo origin para funcionar com proxy reverso.
 */
export function getCosmeticImageUrl(url: string | null | undefined): string | undefined {
  if (!url || (typeof url === 'string' && url.trim() === '')) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = getImageBaseUrl();
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Path da imagem da sleeve padrão ("Default" / SkinDefault). Usado quando a sleeve equipada não carrega. */
export const DEFAULT_SKIN_CARD_IMAGE_PATH = '/uploads/cards/card_default_1764393525708.webp';

/**
 * URL da imagem SkinDefault (sleeve padrão). Use como fallback quando a sleeve equipada falhar ao carregar.
 */
export function getDefaultSkinCardImageUrl(): string {
  const url = getCosmeticImageUrl(DEFAULT_SKIN_CARD_IMAGE_PATH);
  return url ?? '/images/fundoCarta.webp';
}
