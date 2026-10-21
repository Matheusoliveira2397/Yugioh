/**
 * Elemental HERO Necroshade / YGOPRO_89252153
 *
 * While this card is in the GY, if you would Tribute a monster for a Tribute Summon,
 * you can remove this card from play instead of Tributing. You can only use this effect
 * for the Tribute Summon of a Level 5 or higher "Elemental HERO" monster.
 * You can only use the effect of "Elemental HERO Necroshade" once per turn.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const ELEMENTAL_HERO_NECROSHADE_KEY = 'elemental-hero-necroshade';

export const ELEMENTAL_HERO_NECROSHADE_IDS = [
  'ElementalHERONecroshade',
  'YGOPRO_89252153',
  '89252153',
] as const;

export const ELEMENTAL_HERO_NECROSHADE_NAMES = [
  'elemental hero necroshade',
  'elemental-hero necroshade',
] as const;

export function isElementalHeroNecroshade(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of ELEMENTAL_HERO_NECROSHADE_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of ELEMENTAL_HERO_NECROSHADE_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  return nameCompact.includes('elementalheronecroshade') || id.includes('89252153');
}

export function isElementalHeroLevel5Plus(card: any): boolean {
  if (!card) return false;
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  const level = Number(card.level) || 0;
  return (nameCompact.includes('elementalhero') || name.includes('elemental hero')) && level >= 5;
}

export function findNecroshadeInGraveyard(graveyard: any[] | undefined): number {
  if (!Array.isArray(graveyard)) return -1;
  for (let i = 0; i < graveyard.length; i++) {
    if (isElementalHeroNecroshade(graveyard[i])) return i;
  }
  return -1;
}
