/**
 * Interplanetarypurplythorny Dragon / YGOPRO_25206027
 *
 * If a monster you control is destroyed by battle or card effect and sent to the Graveyard:
 * You can Special Summon this card from your hand.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const INTERPLANETARYPURPLYTHORNY_DRAGON_KEY = 'interplanetarypurplythorny-dragon';

export const INTERPLANETARYPURPLYTHORNY_DRAGON_IDS = [
  'InterplanetarypurplythornyDragon',
  'YGOPRO_25206027',
  '25206027',
] as const;

export const INTERPLANETARYPURPLYTHORNY_DRAGON_NAMES = [
  'interplanetarypurplythorny dragon',
  'dragao interplanetario espinhoso roxo',
  'dragão interplanetário espinhoso roxo',
] as const;

export function isInterplanetarypurplythornyDragon(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of INTERPLANETARYPURPLYTHORNY_DRAGON_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of INTERPLANETARYPURPLYTHORNY_DRAGON_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (
    nameCompact.includes('interplanetarypurplythorny') ||
    nameCompact.includes('dragaointerplanetario') ||
    id.includes('25206027')
  ) {
    return true;
  }
  return false;
}

/**
 * Find Interplanetarypurplythorny Dragon in hand.
 */
export function findInterplanetarypurplythornyDragonInHand(
  hand: any[] | undefined,
): { card: any; handIndex: number } | null {
  if (!Array.isArray(hand)) return null;
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (c && isInterplanetarypurplythornyDragon(c)) {
      return { card: c, handIndex: i };
    }
  }
  return null;
}
