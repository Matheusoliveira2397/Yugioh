/**
 * Elemental HERO Thunder Giant / YGOPRO_61204971
 *
 * Fusion Monster
 * Once per turn: You can discard 1 card, then target 1 face-up monster your opponent controls
 * with ATK less than or equal to this card's ATK; destroy that target.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const ELEMENTAL_HERO_THUNDER_GIANT_KEY = 'elemental-hero-thunder-giant';

export const ELEMENTAL_HERO_THUNDER_GIANT_IDS = [
  'ElementalHEROThunderGiant',
  'YGOPRO_61204971',
  '61204971',
] as const;

export const ELEMENTAL_HERO_THUNDER_GIANT_NAMES = [
  'elemental hero thunder giant',
  'elemental-hero thunder giant',
] as const;

export function isElementalHeroThunderGiant(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of ELEMENTAL_HERO_THUNDER_GIANT_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of ELEMENTAL_HERO_THUNDER_GIANT_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  return nameCompact.includes('elementalherothundergiant') || id.includes('61204971');
}

export function canActivateThunderGiantEffect(monster: any): boolean {
  if (!isElementalHeroThunderGiant(monster)) return false;
  const used = monster.thunderGiantUsedThisTurn || false;
  return !used;
}

export function listValidThunderGiantTargets(
  opponentField: any,
  thunderGiantAtk: number,
): Array<{ card: any; zoneIndex: number }> {
  if (!opponentField?.monsters || !Array.isArray(opponentField.monsters)) return [];
  const out: Array<{ card: any; zoneIndex: number }> = [];
  for (let i = 0; i < opponentField.monsters.length; i++) {
    const m = opponentField.monsters[i];
    if (!m) continue;
    const position = String(m.position || '').toLowerCase();
    const isFaceUp = position === 'attack' || position === 'defense' || position === 'face-up';
    if (!isFaceUp) continue;
    const originalAtk = m.originalAtk || m.atk || 0;
    if (originalAtk <= thunderGiantAtk) {
      out.push({ card: m, zoneIndex: i });
    }
  }
  return out;
}
