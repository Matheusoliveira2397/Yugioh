/**
 * Retorna a URL completa para exibir uma imagem (foto de perfil, logo, troféu, etc.).
 * Se a URL já for absoluta (http/https), retorna como está (ex: Supabase Storage).
 * Caso contrário, concatena com a API do backend (em produção defina VITE_API_URL).
 */
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function getImageUrl(
  url: string | null | undefined,
  defaultUrl = '/images/default.png',
): string {
  if (!url) return defaultUrl;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * URL para cosméticos (playmat, skin de carta). Retorna URL absoluta ou undefined se não houver.
 * Em produção, garante que paths relativos (ex: /uploads/...) usem a API correta.
 */
export function getCosmeticImageUrl(url: string | null | undefined): string | undefined {
  if (!url || url.trim() === '') return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}
