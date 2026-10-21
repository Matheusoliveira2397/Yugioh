/**
 * Dark Paladin / YGOPRO_98502113
 *
 * "Dark Magician" + "Buster Blader"
 * Must be Fusion Summoned.
 * When a Spell Card is activated (Quick Effect): You can discard 1 card; negate the activation, and if you do, destroy it.
 * This card gains 500 ATK for each Dragon monster on the field and in either player's Graveyard.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';
import { isDragonMonster } from './buster-blader';

export const DARK_PALADIN_KEY = 'dark-paladin';

export const DARK_PALADIN_IDS = [
  'DarkPaladin',
  'YGOPRO_98502113',
  '98502113',
] as const;

export const DARK_PALADIN_NAMES = [
  'dark paladin',
  'paladino das trevas',
  'paladino negro',
] as const;

export function isDarkPaladin(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of DARK_PALADIN_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of DARK_PALADIN_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (
    nameCompact.includes('darkpaladin') ||
    nameCompact.includes('paladinodastre') ||
    nameCompact.includes('paladinonegro') ||
    id.includes('98502113')
  ) {
    return true;
  }
  return false;
}

/**
 * Count Dragons on both fields and in both graveyards for Dark Paladin's ATK bonus.
 */
export function countDragonsForDarkPaladin(
  player1Field: any,
  player2Field: any,
): number {
  let count = 0;
  
  // Count on fields
  const countFieldDragons = (field: any) => {
    if (!field?.monsters) return 0;
    let n = 0;
    for (const m of field.monsters) {
      if (m && isDragonMonster(m)) {
        const pos = String(m.position || '').toLowerCase();
        if (pos !== 'set' && pos !== 'face-down') {
          n++;
        }
      }
    }
    return n;
  };
  
  // Count in graveyards
  const countGraveyardDragons = (graveyard: any[] | undefined) => {
    if (!Array.isArray(graveyard)) return 0;
    let n = 0;
    for (const c of graveyard) {
      if (c && isDragonMonster(c)) {
        n++;
      }
    }
    return n;
  };
  
  count += countFieldDragons(player1Field);
  count += countFieldDragons(player2Field);
  count += countGraveyardDragons(player1Field?.graveyard);
  count += countGraveyardDragons(player2Field?.graveyard);
  
  return count;
}

/**
 * Get Dark Paladin's ATK bonus (+500 per Dragon).
 */
export function getDarkPaladinAtkBonus(
  monster: any,
  ownerField: any,
  opponentField: any,
): number {
  if (!monster || !isDarkPaladin(monster)) return 0;
  const pos = String(monster.position || '').toLowerCase();
  if (pos === 'set' || pos === 'face-down') return 0;
  
  const dragonCount = countDragonsForDarkPaladin(ownerField, opponentField);
  return dragonCount * 500;
}

/**
 * Check if Dark Paladin can negate spell activation.
 */
export function canDarkPaladinNegateSpell(
  monster: any,
  ownerField: any,
): boolean {
  if (!monster || !isDarkPaladin(monster)) return false;
  const pos = String(monster.position || '').toLowerCase();
  if (pos === 'set' || pos === 'face-down') return false;
  
  // Need at least 1 card in hand to discard
  return Array.isArray(ownerField?.hand) && ownerField.hand.length > 0;
}

/**
 * Find Dark Paladin face-up on field.
 */
export function findDarkPaladinOnField(field: any): { monster: any; zoneIndex: number } | null {
  if (!field?.monsters) return null;
  for (let i = 0; i < field.monsters.length; i++) {
    const m = field.monsters[i];
    if (m && isDarkPaladin(m)) {
      const pos = String(m.position || '').toLowerCase();
      if (pos === 'attack' || pos === 'defense') {
        return { monster: m, zoneIndex: i };
      }
    }
  }
  return null;
}
