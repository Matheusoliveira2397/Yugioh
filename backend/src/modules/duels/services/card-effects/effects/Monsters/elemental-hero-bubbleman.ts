/**
 * Elemental HERO Bubbleman / YGOPRO_79979666
 *
 * If this is the only card in your hand, you can Special Summon it (from your hand).
 * When this card is Summoned: If you have no other cards on your hand and field (other than this card),
 * you can draw 2 cards.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const ELEMENTAL_HERO_BUBBLEMAN_KEY = 'elemental-hero-bubbleman';

export const ELEMENTAL_HERO_BUBBLEMAN_IDS = [
  'ElementalHEROBubbleman',
  'YGOPRO_79979666',
  '79979666',
] as const;

export const ELEMENTAL_HERO_BUBBLEMAN_NAMES = [
  'elemental hero bubbleman',
  'elemental-hero bubbleman',
] as const;

export function isElementalHeroBubbleman(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of ELEMENTAL_HERO_BUBBLEMAN_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of ELEMENTAL_HERO_BUBBLEMAN_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  return nameCompact.includes('elementalherobubbleman') || id.includes('79979666');
}

export function canSpecialSummonBubbleman(hand: any[] | undefined, card: any): boolean {
  if (!Array.isArray(hand) || hand.length !== 1) return false;
  return hand[0] === card && isElementalHeroBubbleman(card);
}

export function canBubblemanDraw2(field: any, hand: any[] | undefined): boolean {
  // Check if hand is empty
  if (Array.isArray(hand) && hand.length > 0) return false;

  // Check if no other cards on field
  const hasOtherMonsters = field?.monsters?.some((m: any) => m != null) || false;
  const hasSpellTrap = field?.spellTrap?.some((st: any) => st != null) || false;

  return !hasOtherMonsters && !hasSpellTrap;
}
