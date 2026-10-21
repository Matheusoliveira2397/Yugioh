/**
 * Vampire Lord / YGOPRO_53839837
 *
 * When this card inflicts battle damage to your opponent: Declare 1 card type (Monster, Spell, or Trap);
 * your opponent sends 1 card of that type from their Deck to the Graveyard.
 *
 * Once per turn, during your next Standby Phase after this card was destroyed by your opponent's card effect
 * and sent to your Graveyard: Special Summon this card.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const VAMPIRE_LORD_KEY = 'vampire-lord';

export const VAMPIRE_LORD_IDS = [
  'VampireLord',
  'YGOPRO_53839837',
  '53839837',
] as const;

export const VAMPIRE_LORD_NAMES = [
  'vampire lord',
  'senhor vampiro',
  'lorde vampiro',
] as const;

export function isVampireLord(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of VAMPIRE_LORD_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of VAMPIRE_LORD_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (
    nameCompact.includes('vampirelord') ||
    nameCompact.includes('senhorvampiro') ||
    nameCompact.includes('lordevampiro') ||
    id.includes('53839837')
  ) {
    return true;
  }
  return false;
}

/**
 * Mark Vampire Lord as destroyed by opponent's card effect for revival.
 */
export function markVampireLordForRevival(
  vampireLord: any,
  currentTurnCounter: number,
  currentPlayer: number,
): void {
  if (!vampireLord) return;
  vampireLord.vampireLordRevivalPending = true;
  vampireLord.vampireLordRevivalTurnCounter = currentTurnCounter;
  vampireLord.vampireLordRevivalPlayer = currentPlayer;
}

/**
 * Check if Vampire Lord in graveyard should be revived during Standby Phase.
 */
export function findVampireLordForStandbyRevival(
  graveyard: any[] | undefined,
  currentTurnCounter: number,
  isPlayer1: boolean,
): { card: any; gyIndex: number } | null {
  if (!Array.isArray(graveyard)) return null;
  
  const currentPlayer = isPlayer1 ? 1 : 2;
  
  for (let i = graveyard.length - 1; i >= 0; i--) {
    const c = graveyard[i];
    if (c && isVampireLord(c) && c.vampireLordRevivalPending) {
      // Check if it's the correct player's standby phase
      // Revival happens during owner's next Standby Phase after destruction
      const revivalPlayer = c.vampireLordRevivalPlayer || 0;
      const revivalTurn = c.vampireLordRevivalTurnCounter || 0;
      
      // If destroyed on owner's turn, revive on next standby (current turn + 2)
      // If destroyed on opponent's turn, revive on next standby (current turn + 1)
      const expectedRevivalTurn = revivalPlayer === currentPlayer ? revivalTurn + 2 : revivalTurn + 1;
      
      if (currentTurnCounter >= expectedRevivalTurn && currentPlayer === revivalPlayer) {
        return { card: c, gyIndex: i };
      }
    }
  }
  return null;
}

/**
 * List cards of specific type in deck for Vampire Lord's mill effect.
 */
export function listCardsByTypeInDeck(
  deck: any[] | undefined,
  cardType: 'monster' | 'spell' | 'trap',
): Array<{ card: any; deckIndex: number }> {
  if (!Array.isArray(deck)) return [];
  const out: Array<{ card: any; deckIndex: number }> = [];
  
  const normalizedType = cardType.toLowerCase();
  
  for (let i = 0; i < deck.length; i++) {
    const c = deck[i];
    if (!c) continue;
    
    const type = String(c.type || c.cardType || '').toLowerCase().trim();
    
    let matches = false;
    if (normalizedType === 'monster') {
      matches = type === 'monster' || type === 'monstro' || type.includes('monster');
    } else if (normalizedType === 'spell') {
      matches = type === 'spell' || type === 'magia' || type === 'feitico' || type === 'feitiço' || type.includes('spell');
    } else if (normalizedType === 'trap') {
      matches = type === 'trap' || type === 'armadilha' || type.includes('trap');
    }
    
    if (matches) {
      out.push({ card: c, deckIndex: i });
    }
  }
  
  return out;
}
