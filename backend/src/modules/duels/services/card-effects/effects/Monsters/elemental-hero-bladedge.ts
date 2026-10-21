/**
 * Elemental HERO Bladedge / YGOPRO_59793705
 *
 * If this card attacks a Defense Position monster, inflict piercing battle damage.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const ELEMENTAL_HERO_BLADEDGE_KEY = 'elemental-hero-bladedge';

export const ELEMENTAL_HERO_BLADEDGE_IDS = [
  'ElementalHEROBladedge',
  'YGOPRO_59793705',
  '59793705',
] as const;

export const ELEMENTAL_HERO_BLADEDGE_NAMES = [
  'elemental hero bladedge',
  'elemental-hero bladedge',
] as const;

export function isElementalHeroBladedge(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of ELEMENTAL_HERO_BLADEDGE_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of ELEMENTAL_HERO_BLADEDGE_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  return nameCompact.includes('elementalherobladedge') || id.includes('59793705');
}

export function hasPiercingDamage(attacker: any): boolean {
  return isElementalHeroBladedge(attacker);
}
