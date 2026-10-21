/**
 * Elemental HERO Heat / YGOPRO_98266377
 *
 * This card gains 200 ATK for each "Elemental HERO" monster you control.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const ELEMENTAL_HERO_HEAT_KEY = 'elemental-hero-heat';

export const ELEMENTAL_HERO_HEAT_IDS = [
  'ElementalHEROHeat',
  'YGOPRO_98266377',
  '98266377',
] as const;

export const ELEMENTAL_HERO_HEAT_NAMES = [
  'elemental hero heat',
  'elemental-hero heat',
] as const;

export function isElementalHeroHeat(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of ELEMENTAL_HERO_HEAT_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of ELEMENTAL_HERO_HEAT_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  return nameCompact.includes('elementalheroheat') || id.includes('98266377');
}

export function isElementalHero(card: any): boolean {
  if (!card) return false;
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  return nameCompact.includes('elementalhero') || name.includes('elemental hero');
}

export function getHeatAtkBonus(field: any): number {
  if (!field?.monsters || !Array.isArray(field.monsters)) return 0;
  let count = 0;
  for (const m of field.monsters) {
    if (m && isElementalHero(m)) {
      count++;
    }
  }
  return count * 200;
}
