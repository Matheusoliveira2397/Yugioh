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

/**
 * Path do arquivo em `public/images/` (o que o banco grava). Sem query string.
 */
export const DEFAULT_PROFILE_ASSET_PATH = '/images/default.jpg';

/**
 * URL usada na UI para o avatar padrão. Inclui `?v=` para invalidar cache do navegador
 * depois de trocar `public/images/default.jpg` — incremente o número ao atualizar a arte.
 */
export const DEFAULT_PROFILE_IMAGE_PATH = `${DEFAULT_PROFILE_ASSET_PATH}?v=4`;

/**
 * Em offline o DNS do Supabase pode falhar (ERR_NAME_NOT_RESOLVED).
 * Reescreve URLs públicas de cartas para o path local em /images/cards/.
 */
export function rewriteStorageUrlToLocal(url: string): string {
  const trimmed = String(url).trim();
  if (!trimmed) return trimmed;

  const cardsMatch = trimmed.match(
    /supabase\.co\/storage\/v1\/object\/public\/cards\/([^/?#]+)/i,
  );
  if (cardsMatch?.[1]) {
    return `/images/cards/${cardsMatch[1]}`;
  }

  const avatarsMatch = trimmed.match(
    /supabase\.co\/storage\/v1\/object\/public\/avatars\/([^/?#]+)/i,
  );
  if (avatarsMatch?.[1]) {
    return `/uploads/avatars/${avatarsMatch[1]}`;
  }

  return trimmed;
}

export function getImageUrl(
  url: string | null | undefined,
  defaultUrl = DEFAULT_PROFILE_IMAGE_PATH,
): string {
  if (url == null || url === undefined) return defaultUrl;
  const trimmed = rewriteStorageUrlToLocal(String(url).trim());
  if (!trimmed) return defaultUrl;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  // `public/images/*` (ex.: `/images/default.jpg`): servido pelo origin do app, não pela API.
  // O duelo manda o path do banco; prefixar com VITE_API_URL quebra em dev (Vite ≠ backend).
  if (trimmed.startsWith('/images/')) {
    return trimmed;
  }
  const base = getImageBaseUrl();
  return `${base}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function profilePathIsDefaultAvatar(pathOnly: string): boolean {
  const p = pathOnly.toLowerCase();
  if (!p) return false;
  if (p === DEFAULT_PROFILE_ASSET_PATH.toLowerCase()) return true;
  if (p.endsWith('/images/default.jpg') || p.endsWith('/images/default.png') || p.endsWith('/images/default.webp')) {
    return true;
  }
  if (p.includes('/images/default')) return true;
  if (p.includes('/avatars/default')) return true;
  return false;
}

/** Sempre retorna URL válida para foto de perfil (mesmo com `null` / vazio / só espaços). */
export function getProfileImageUrl(url: string | null | undefined): string {
  const resolved = getImageUrl(url, DEFAULT_PROFILE_IMAGE_PATH);
  try {
    const u = new URL(resolved, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    const pathOnly = u.pathname;
    if (profilePathIsDefaultAvatar(pathOnly)) {
      return DEFAULT_PROFILE_IMAGE_PATH;
    }
  } catch {
    const withoutOrigin = resolved.replace(/^https?:\/\/[^/]+/i, '');
    const pathOnly = withoutOrigin.split('?')[0];
    if (profilePathIsDefaultAvatar(pathOnly)) {
      return DEFAULT_PROFILE_IMAGE_PATH;
    }
  }
  return resolved;
}

/**
 * URL para cosméticos (playmat, sleeve do oponente). Retorna URL absoluta ou undefined se não houver.
 * Em produção usa VITE_API_URL; se não definida, usa o mesmo origin para funcionar com proxy reverso.
 */
export function getCosmeticImageUrl(url: string | null | undefined): string | undefined {
  if (!url || (typeof url === 'string' && url.trim() === '')) return undefined;
  const normalized = rewriteStorageUrlToLocal(url.trim());
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized;
  const base = getImageBaseUrl();
  return `${base}${normalized.startsWith('/') ? '' : '/'}${normalized}`;
}

/**
 * URL para exibir imagem de carta no duelo/loja.
 * - /images/cards/* → mesmo origin do app (frontend public ou nginx), para não pegar da API
 * - /uploads/cards/* → base da API (backend)
 * - URL absoluta (ex.: Supabase) → retorna como está
 */
export function getCardImageDisplayUrl(url: string | null | undefined): string {
  if (!url || (typeof url === 'string' && url.trim() === '')) return '';
  const normalized = rewriteStorageUrlToLocal(url.trim());
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized;
  // Mesmo origin: path relativo evita string extra por frame e reutiliza cache igual
  if (normalized.startsWith('/images/cards') || normalized.startsWith('/images/')) {
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
  }
  // Uploads ficam no backend
  const base = getImageBaseUrl();
  return `${base}${normalized.startsWith('/') ? '' : '/'}${normalized}`;
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
