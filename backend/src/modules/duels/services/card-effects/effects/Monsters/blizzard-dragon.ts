/**
 * Blizzard Dragon / YGOPRO_61802346
 *
 * Once per turn: You can target 1 monster your opponent controls;
 * that target cannot change its battle position or attack until the end of your opponent's next turn.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const BLIZZARD_DRAGON_KEY = 'blizzard-dragon';

export const BLIZZARD_DRAGON_IDS = [
  'BlizzardDragon',
  'YGOPRO_61802346',
  '61802346',
] as const;

export const BLIZZARD_DRAGON_NAMES = [
  'blizzard dragon',
  'dragao blizzard',
  'dragão blizzard',
] as const;

export function isBlizzardDragon(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of BLIZZARD_DRAGON_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of BLIZZARD_DRAGON_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('blizzarddragon') || nameCompact.includes('dragaoblizzard') || id.includes('61802346')) {
    return true;
  }
  return false;
}

/**
 * Check if Blizzard Dragon can activate its effect this turn.
 */
export function canActivateBlizzardDragonEffect(
  monster: any,
  ownerField: any,
  duel: any,
): boolean {
  if (!monster || !isBlizzardDragon(monster)) return false;
  const pos = String(monster.position || '').toLowerCase();
  if (pos === 'set' || pos === 'face-down') return false;

  const turnCounter = duel.turnCounter || 1;
  const lastUsed = monster.blizzardLastUsedTurn || 0;
  
  // Once per turn
  return lastUsed < turnCounter;
}

/**
 * Mark a monster as locked by Blizzard Dragon until end of opponent's next turn.
 */
export function lockMonsterWithBlizzard(
  targetMonster: any,
  currentTurnCounter: number,
  currentPlayer: number, // 1 or 2
): void {
  if (!targetMonster) return;
  
  // Calculate when lock expires: end of opponent's next turn
  // If current turn is P1's turn (1), opponent is P2 (2)
  // Lock expires after P2's next turn ends
  const opponentNextTurnEnd = currentTurnCounter + 2;
  
  targetMonster.blizzardLockedUntil = opponentNextTurnEnd;
  targetMonster.blizzardLocked = true;
}

/**
 * Check if a monster is currently locked by Blizzard Dragon.
 */
export function isMonsterBlizzardLocked(monster: any, currentTurnCounter: number): boolean {
  if (!monster?.blizzardLocked) return false;
  const until = monster.blizzardLockedUntil || 0;
  return currentTurnCounter < until;
}

/**
 * Clear Blizzard lock if expired.
 */
export function clearExpiredBlizzardLock(monster: any, currentTurnCounter: number): void {
  if (!monster?.blizzardLocked) return;
  const until = monster.blizzardLockedUntil || 0;
  if (currentTurnCounter >= until) {
    delete monster.blizzardLocked;
    delete monster.blizzardLockedUntil;
  }
}
