/**
 * Wroughtweiler / YGOPRO_6480253
 *
 * If this card is destroyed by battle and sent to the GY:
 * You can add 1 "Elemental HERO" monster and 1 "Polymerization" from your GY to your hand.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const WROUGHTWEILER_KEY = 'wroughtweiler';

export const WROUGHTWEILER_IDS = [
  'Wroughtweiler',
  'YGOPRO_6480253',
  '6480253',
] as const;

export const WROUGHTWEILER_NAMES = [
  'wroughtweiler',
] as const;

export function isWroughtweiler(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of WROUGHTWEILER_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of WROUGHTWEILER_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  return nameCompact.includes('wroughtweiler') || id.includes('6480253');
}

export function isElementalHero(card: any): boolean {
  if (!card) return false;
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  return nameCompact.includes('elementalhero') || name.includes('elemental hero');
}

export function isPolymerization(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  return (
    nameCompact.includes('polymerization') ||
    nameCompact.includes('polimerizacao') ||
    id.includes('24094653') ||
    id.includes('polymerization')
  );
}

export function listElementalHeroInGraveyard(
  graveyard: any[] | undefined,
): Array<{ card: any; index: number }> {
  if (!Array.isArray(graveyard)) return [];
  const out: Array<{ card: any; index: number }> = [];
  for (let i = 0; i < graveyard.length; i++) {
    const c = graveyard[i];
    if (c && isElementalHero(c)) {
      out.push({ card: c, index: i });
    }
  }
  return out;
}

export function listPolymerizationInGraveyard(
  graveyard: any[] | undefined,
): Array<{ card: any; index: number }> {
  if (!Array.isArray(graveyard)) return [];
  const out: Array<{ card: any; index: number }> = [];
  for (let i = 0; i < graveyard.length; i++) {
    const c = graveyard[i];
    if (c && isPolymerization(c)) {
      out.push({ card: c, index: i });
    }
  }
  return out;
}
