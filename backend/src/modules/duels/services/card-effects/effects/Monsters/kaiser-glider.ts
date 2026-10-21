/**
 * Kaiser Glider / YGOPRO_52824910
 *
 * This card cannot be destroyed by battle with a monster that has the same ATK as this card.
 * If this card is destroyed and sent to the Graveyard: Target 1 monster on the field; return that target to the hand.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const KAISER_GLIDER_KEY = 'kaiser-glider';

export const KAISER_GLIDER_IDS = [
  'KaiserGlider',
  'YGOPRO_52824910',
  '52824910',
] as const;

export const KAISER_GLIDER_NAMES = [
  'kaiser glider',
  'planador do imperador',
] as const;

export function isKaiserGlider(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of KAISER_GLIDER_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of KAISER_GLIDER_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('kaiserglider') || nameCompact.includes('planadordoimperador') || id.includes('52824910')) {
    return true;
  }
  return false;
}

/**
 * Check if Kaiser Glider should be protected from destruction by equal ATK.
 */
export function isKaiserGliderProtectedFromEqualAtk(
  kaiserAtk: number,
  opponentAtk: number,
): boolean {
  return kaiserAtk === opponentAtk;
}

/**
 * List all monsters on both fields for Kaiser Glider's bounce effect.
 */
export function listAllMonstersForKaiserBounce(
  player1Field: any,
  player2Field: any,
): Array<{ monster: any; zoneIndex: number; isPlayer1: boolean }> {
  const out: Array<{ monster: any; zoneIndex: number; isPlayer1: boolean }> = [];
  
  const scanField = (field: any, isPlayer1: boolean) => {
    if (!field?.monsters) return;
    for (let i = 0; i < field.monsters.length; i++) {
      const m = field.monsters[i];
      if (m) {
        out.push({ monster: m, zoneIndex: i, isPlayer1 });
      }
    }
  };
  
  scanField(player1Field, true);
  scanField(player2Field, false);
  
  return out;
}
