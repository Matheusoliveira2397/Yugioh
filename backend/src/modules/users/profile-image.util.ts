/**
 * Para APIs / WebSocket: `null` = usar avatar padrão no cliente (mesma regra que /me e login).
 */
export function normalizeProfileImageForClient(
  profileImage: string | null | undefined,
): string | null {
  if (profileImage == null || profileImage === undefined) return null;
  const s = String(profileImage).trim();
  if (!s) return null;
  if (s.includes('/images/default') || s.includes('/avatars/default')) {
    return null;
  }
  return profileImage;
}
