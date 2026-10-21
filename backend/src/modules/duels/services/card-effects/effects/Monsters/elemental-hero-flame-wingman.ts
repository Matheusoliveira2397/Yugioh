/**
 * Elemental HERO Flame Wingman / YGOPRO_35809262
 *
 * Fusion Monster
 * When this card destroys a monster by battle and sends it to the GY:
 * Inflict damage to your opponent equal to the ATK of the destroyed monster in the GY.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const ELEMENTAL_HERO_FLAME_WINGMAN_KEY = 'elemental-hero-flame-wingman';

export const ELEMENTAL_HERO_FLAME_WINGMAN_IDS = [
  'ElementalHEROFlameWingman',
  'YGOPRO_35809262',
  '35809262',
] as const;

export const ELEMENTAL_HERO_FLAME_WINGMAN_NAMES = [
  'elemental hero flame wingman',
  'elemental-hero flame wingman',
] as const;

export function isElementalHeroFlameWingman(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of ELEMENTAL_HERO_FLAME_WINGMAN_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of ELEMENTAL_HERO_FLAME_WINGMAN_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  return nameCompact.includes('elementalheroflamewingman') || id.includes('35809262');
}

export function shouldFlameWingmanInflictDamage(attacker: any, destroyed: any): boolean {
  if (!isElementalHeroFlameWingman(attacker)) return false;
  return destroyed && (destroyed.atk || 0) > 0;
}

export function getFlameWingmanDamage(destroyed: any): number {
  return destroyed?.atk || 0;
}
