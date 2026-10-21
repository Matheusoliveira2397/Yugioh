/**
 * Elemental HERO Wildheart / YGOPRO_86188410
 *
 * This card is unaffected by Trap effects.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const ELEMENTAL_HERO_WILDHEART_KEY = 'elemental-hero-wildheart';

export const ELEMENTAL_HERO_WILDHEART_IDS = [
  'ElementalHEROWildheart',
  'YGOPRO_86188410',
  '86188410',
] as const;

export const ELEMENTAL_HERO_WILDHEART_NAMES = [
  'elemental hero wildheart',
  'elemental-hero wildheart',
] as const;

export function isElementalHeroWildheart(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of ELEMENTAL_HERO_WILDHEART_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of ELEMENTAL_HERO_WILDHEART_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  return nameCompact.includes('elementalherowildheart') || id.includes('86188410');
}

export function isWildheartUnaffectedByTrap(target: any): boolean {
  return isElementalHeroWildheart(target);
}
