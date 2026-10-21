/**
 * Berfomet
 *
 * When this card is Normal or Flip Summoned: You can add 1 "Gazelle the King of Mythical Beasts"
 * from your Deck to your hand.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const BERFOMET_KEY = 'berfomet';

export const BERFOMET_IDS = [
  'Berfomet',
  'YGOPRO_77207191',
  '77207191',
] as const;

export const BERFOMET_NAMES = [
  'berfomet',
] as const;

export const GAZELLE_IDS = [
  'GazelleTheKingOfMythicalBeasts',
  'YGOPRO_5818798',
  '5818798',
] as const;

export const GAZELLE_NAMES = [
  'gazelle the king of mythical beasts',
  'gazela o rei das bestas miticas',
  'gazela o rei das bestas míticas',
] as const;

export function isBerfomet(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of BERFOMET_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of BERFOMET_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('berfomet') || id.includes('berfomet') || id.includes('77207191')) {
    return true;
  }
  return false;
}

export function isGazelle(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of GAZELLE_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of GAZELLE_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('gazellethekingofmythicalbeasts') || nameCompact.includes('gazelaorei') || id.includes('5818798')) {
    return true;
  }
  return false;
}

export function listGazelleInDeck(
  deck: any[] | undefined,
): Array<{ card: any; deckIndex: number }> {
  if (!Array.isArray(deck)) return [];
  const out: Array<{ card: any; deckIndex: number }> = [];
  for (let i = 0; i < deck.length; i++) {
    const c = deck[i];
    if (!c) continue;
    if (!isGazelle(c)) continue;
    out.push({ card: c, deckIndex: i });
  }
  return out;
}
