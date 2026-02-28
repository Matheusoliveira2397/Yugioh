/**
 * Retorna a URL completa para exibir uma imagem (avatar, logo, troféu, etc.).
 * Se a URL já for absoluta (http/https), retorna como está (ex: Supabase Storage).
 * Caso contrário, concatena com a API do backend.
 */
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function getImageUrl(
  url: string | null | undefined,
  defaultUrl = '/images/default.png',
): string {
  if (!url) return defaultUrl;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url}`;
}
