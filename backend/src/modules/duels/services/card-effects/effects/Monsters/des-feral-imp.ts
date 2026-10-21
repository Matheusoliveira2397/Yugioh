/**
 * Des Feral Imp / YGOPRO_81985784
 *
 * FLIP: Target 1 card in your Graveyard; shuffle that target into the Deck.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const DES_FERAL_IMP_KEY = 'des-feral-imp';

export const DES_FERAL_IMP_IDS = [
  'DesFeralImp',
  'YGOPRO_81985784',
  '81985784',
] as const;

export const DES_FERAL_IMP_NAMES = [
  'des feral imp',
  'diabrete feral de des',
] as const;

export function isDesFeralImp(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of DES_FERAL_IMP_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of DES_FERAL_IMP_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('desferalimp') || nameCompact.includes('diabreteferal') || id.includes('81985784')) {
    return true;
  }
  return false;
}

/**
 * List all cards in graveyard for Des Feral Imp effect.
 */
export function listCardsInGraveyardForDesFeralImp(
  graveyard: any[] | undefined,
): Array<{ card: any; gyIndex: number }> {
  if (!Array.isArray(graveyard)) return [];
  const out: Array<{ card: any; gyIndex: number }> = [];
  for (let i = 0; i < graveyard.length; i++) {
    const c = graveyard[i];
    if (c) {
      out.push({ card: c, gyIndex: i });
    }
  }
  return out;
}
