/**
 * Electromagnetic Turtle / Tartaruga Eletromagnética
 *
 * Durante a Battle Phase do oponente (Quick Effect): você pode banir este card
 * do GY; encerre a Battle Phase. Só pode usar este efeito 1x por duelo.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const ELECTROMAGNETIC_TURTLE_KEY = 'electromagnetic-turtle';

export const ELECTROMAGNETIC_TURTLE_IDS = [
  'ElectromagneticTurtle',
  'YGOPRO_34710660',
  '34710660',
] as const;

export const ELECTROMAGNETIC_TURTLE_NAMES = [
  'electromagnetic turtle',
  'tartaruga eletromagnetica',
  'tartaruga eletromagnética',
] as const;

export function isElectromagneticTurtle(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  for (const k of ELECTROMAGNETIC_TURTLE_IDS) {
    if (id === compactCardKey(k) || id.includes(compactCardKey(k))) return true;
  }
  for (const k of ELECTROMAGNETIC_TURTLE_NAMES) {
    if (name === normalizeCardKey(k)) return true;
  }
  return (
    nameCompact.includes('electromagneticturtle') ||
    nameCompact.includes('tartarugaeletromagnetica')
  );
}

export function findElectromagneticTurtleInGraveyard(
  graveyard: any[] | undefined,
): { card: any; index: number } | null {
  if (!Array.isArray(graveyard)) return null;
  for (let i = 0; i < graveyard.length; i++) {
    if (graveyard[i] && isElectromagneticTurtle(graveyard[i])) {
      return { card: graveyard[i], index: i };
    }
  }
  return null;
}

export function canUseElectromagneticTurtleThisDuel(playerField: any): boolean {
  return playerField?.electromagneticTurtleUsedThisDuel !== true;
}

export function markElectromagneticTurtleUsed(playerField: any): void {
  playerField.electromagneticTurtleUsedThisDuel = true;
}
