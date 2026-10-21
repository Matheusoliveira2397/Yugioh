/**
 * Normalização e match EXATO de cartas.
 * Nunca use includes()/parcial — isso faz um efeito “pegar” outra carta com o tempo.
 */

export function normalizeCardKey(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Remove espaços/hífens/apóstrofos para comparar ids tipo DarkHole vs dark-hole */
export function compactCardKey(value: unknown): string {
  return normalizeCardKey(value).replace(/[\s_\-']/g, '');
}

export function cardNameCandidates(card: any): string[] {
  const raw = [card?.name, card?.cardName].filter(Boolean);
  return raw.map(normalizeCardKey);
}

export function cardIdCandidates(card: any): string[] {
  const raw = [card?.idCarta, card?.id, card?.cardId].filter(Boolean);
  return raw.map((v) => normalizeCardKey(v));
}

/**
 * Match estrito: nome ou id deve ser igual (após normalizar),
 * ou id compacto igual (DarkHole === darkhole).
 */
export function exactCardMatch(
  card: any,
  names: string[],
  ids?: string[],
): boolean {
  const namesNorm = names.map(normalizeCardKey);
  for (const candidate of cardNameCandidates(card)) {
    if (namesNorm.includes(candidate)) return true;
  }

  if (ids?.length) {
    const idsNorm = ids.map(normalizeCardKey);
    const idsCompact = ids.map(compactCardKey);
    for (const candidate of cardIdCandidates(card)) {
      if (idsNorm.includes(candidate)) return true;
      if (idsCompact.includes(compactCardKey(candidate))) return true;
    }
  }

  return false;
}
