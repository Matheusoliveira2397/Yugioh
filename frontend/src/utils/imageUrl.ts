/**
 * Base URL da API (backend). Em produção deve ser definida VITE_API_URL.
 * Usada para montar URLs de imagens (cosméticos, uploads) no mesmo host da API.
 */
function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL;
  if (env && typeof env === 'string' && env.trim() !== '') return env.trim();
  // Fallback: em produção às vezes front e API estão no mesmo origin (proxy); usar origin para imagens relativas
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'http://localhost:3000';
}

export function getImageUrl(
  url: string | null | undefined,
  defaultUrl = '/images/default.png',
): string {
  if (!url) return defaultUrl;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = getApiBaseUrl();
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * URL para cosméticos (playmat, skin de carta do oponente). Retorna URL absoluta ou undefined se não houver.
 * Em produção usa VITE_API_URL; se não definida, usa o mesmo origin para funcionar com proxy reverso.
 */
export function getCosmeticImageUrl(url: string | null | undefined): string | undefined {
  if (!url || (typeof url === 'string' && url.trim() === '')) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = getApiBaseUrl();
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}
