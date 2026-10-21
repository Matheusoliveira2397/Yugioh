/**
 * Archfiend of Gilfer / YGOPRO_50287060
 *
 * When this card is sent to the Graveyard: You can target 1 face-up monster on the field;
 * equip that target with this card. That monster loses 500 ATK while equipped with this card.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const ARCHFIEND_OF_GILFER_KEY = 'archfiend-of-gilfer';

export const ARCHFIEND_OF_GILFER_CARD_IDS = [
  'ArchfiendOfGilfer',
  'ArchfiendGilfer',
  'YGOPRO_50287060',
  '50287060',
] as const;

export const ARCHFIEND_OF_GILFER_CARD_NAMES = [
  'archfiend of gilfer',
  'arquidemonio de gilfer',
  'arquidemônio de gilfer',
] as const;

export function isArchfiendOfGilfer(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of ARCHFIEND_OF_GILFER_CARD_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of ARCHFIEND_OF_GILFER_CARD_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('archfiendofgilfer') || nameCompact.includes('arquidemoniodegilfer')) {
    return true;
  }
  if (id.includes('50287060')) {
    return true;
  }
  return false;
}

/**
 * Collect face-up monsters from both fields.
 */
export function collectFaceUpMonstersBothFields(
  playerField: any,
  opponentField: any,
): Array<{ zoneIndex: number; isOpponent: boolean; monster: any }> {
  const out: Array<{ zoneIndex: number; isOpponent: boolean; monster: any }> = [];
  const scan = (field: any, isOpponent: boolean) => {
    if (!field?.monsters) return;
    for (let i = 0; i < field.monsters.length; i++) {
      const m = field.monsters[i];
      if (m && (m.position === 'attack' || m.position === 'defense')) {
        out.push({ zoneIndex: i, isOpponent, monster: m });
      }
    }
  };
  scan(playerField, false);
  scan(opponentField, true);
  return out;
}

/**
 * Find first empty Spell/Trap zone in owner field (for equipping Gilfer from GY).
 */
export function findFirstEmptySpellTrapZone(spellTrap: any[] | undefined): number {
  if (!spellTrap || !Array.isArray(spellTrap)) return -1;
  for (let i = 0; i < 5; i++) {
    if (spellTrap[i] === null || spellTrap[i] === undefined) return i;
  }
  return -1;
}

export function canActivateArchfiendOfGilferEffect(ownerField: any): boolean {
  // Need at least one face-up monster on field and empty S/T zone
  const hasEmptySpellTrap = findFirstEmptySpellTrapZone(ownerField.spellTrap) !== -1;
  return hasEmptySpellTrap;
}
