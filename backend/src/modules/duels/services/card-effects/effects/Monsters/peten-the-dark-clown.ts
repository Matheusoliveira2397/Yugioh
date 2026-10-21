/**
 * Peten the Dark Clown / YGOPRO_52624755
 *
 * When this card is sent to the Graveyard: You can banish this card from your Graveyard;
 * Special Summon 1 "Peten the Dark Clown" from your hand or Deck.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const PETEN_THE_DARK_CLOWN_KEY = 'peten-the-dark-clown';

export const PETEN_IDS = [
  'PetenTheDarkClown',
  'YGOPRO_52624755',
  '52624755',
] as const;

export const PETEN_NAMES = [
  'peten the dark clown',
  'peten o palhaco das trevas',
  'peten o palhaço das trevas',
] as const;

export function isPetenTheDarkClown(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of PETEN_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of PETEN_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('petenthedarkclown') || nameCompact.includes('petenopalhaco') || id.includes('52624755')) {
    return true;
  }
  return false;
}

/**
 * Find Peten in graveyard that was just sent there.
 */
export function findPetenInGraveyard(
  graveyard: any[] | undefined,
  instanceId?: string,
): { card: any; gyIndex: number } | null {
  if (!Array.isArray(graveyard)) return null;
  
  // If instanceId provided, find that specific Peten
  if (instanceId) {
    for (let i = graveyard.length - 1; i >= 0; i--) {
      const c = graveyard[i];
      if (c && isPetenTheDarkClown(c) && c.instanceId === instanceId) {
        return { card: c, gyIndex: i };
      }
    }
  }
  
  // Otherwise find most recent Peten
  for (let i = graveyard.length - 1; i >= 0; i--) {
    const c = graveyard[i];
    if (c && isPetenTheDarkClown(c)) {
      return { card: c, gyIndex: i };
    }
  }
  return null;
}

/**
 * List all Peten the Dark Clown in hand or deck.
 */
export function listPetenInHandOrDeck(
  hand: any[] | undefined,
  deck: any[] | undefined,
): Array<{ card: any; location: 'hand' | 'deck'; index: number }> {
  const out: Array<{ card: any; location: 'hand' | 'deck'; index: number }> = [];
  
  if (Array.isArray(hand)) {
    for (let i = 0; i < hand.length; i++) {
      const c = hand[i];
      if (c && isPetenTheDarkClown(c)) {
        out.push({ card: c, location: 'hand', index: i });
      }
    }
  }
  
  if (Array.isArray(deck)) {
    for (let i = 0; i < deck.length; i++) {
      const c = deck[i];
      if (c && isPetenTheDarkClown(c)) {
        out.push({ card: c, location: 'deck', index: i });
      }
    }
  }
  
  return out;
}
