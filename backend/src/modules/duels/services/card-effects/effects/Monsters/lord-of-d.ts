/**
 * Lord of D. / YGOPRO_17985575
 *
 * Neither player can target Dragon monsters on the field with card effects.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const LORD_OF_D_KEY = 'lord-of-d';

export const LORD_OF_D_IDS = [
  'LordOfD',
  'LordOfD.',
  'YGOPRO_17985575',
  '17985575',
] as const;

export const LORD_OF_D_NAMES = [
  'lord of d',
  'lord of d.',
  'senhor de d',
  'senhor de d.',
] as const;

export function isLordOfD(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of LORD_OF_D_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of LORD_OF_D_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('lordofd') || nameCompact.includes('senhorded') || id.includes('17985575')) {
    return true;
  }
  return false;
}

export function isDragonType(card: any): boolean {
  if (!card) return false;
  const race = String(card.race || card.monsterRace || '').toLowerCase();
  return race === 'dragon' || race === 'dragao' || race === 'dragão';
}

/**
 * Check if any Lord of D. is face-up on either field.
 */
export function isLordOfDActiveOnField(player1Field: any, player2Field: any): boolean {
  const checkField = (field: any) => {
    if (!field?.monsters) return false;
    for (const m of field.monsters) {
      if (m && isLordOfD(m)) {
        const pos = String(m.position || '').toLowerCase();
        if (pos === 'attack' || pos === 'defense') {
          return true;
        }
      }
    }
    return false;
  };
  return checkField(player1Field) || checkField(player2Field);
}

/**
 * Filter out Dragon monsters from target list if Lord of D. is active.
 */
export function filterDragonsIfLordActive(
  targets: any[],
  player1Field: any,
  player2Field: any,
): any[] {
  if (!isLordOfDActiveOnField(player1Field, player2Field)) {
    return targets;
  }
  return targets.filter((t) => !isDragonType(t.monster || t.card || t));
}
