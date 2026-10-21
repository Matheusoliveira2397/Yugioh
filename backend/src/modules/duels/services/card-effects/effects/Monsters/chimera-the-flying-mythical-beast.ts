/**
 * Chimera the Flying Mythical Beast / YGOPRO_4796100
 *
 * When this card is destroyed: You can target 1 "Berfomet" or "Gazelle the King of Mythical Beasts"
 * in your Graveyard; Special Summon that target.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';
import { isBerfomet, isGazelle } from './berfomet';

export const CHIMERA_THE_FLYING_MYTHICAL_BEAST_KEY = 'chimera-the-flying-mythical-beast';

export const CHIMERA_IDS = [
  'ChimeraTheFlyingMythicalBeast',
  'YGOPRO_4796100',
  '4796100',
] as const;

export const CHIMERA_NAMES = [
  'chimera the flying mythical beast',
  'quimera a besta mitica voadora',
  'quimera a besta mítica voadora',
] as const;

export function isChimeraTheFlyingMythicalBeast(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of CHIMERA_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of CHIMERA_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (
    nameCompact.includes('chimeratheflyingmythicalbeast') ||
    nameCompact.includes('quimeraabesta') ||
    id.includes('4796100')
  ) {
    return true;
  }
  return false;
}

/**
 * List Berfomet or Gazelle in graveyard for Chimera's effect.
 */
export function listBerfometOrGazelleInGraveyard(
  graveyard: any[] | undefined,
): Array<{ card: any; gyIndex: number }> {
  if (!Array.isArray(graveyard)) return [];
  const out: Array<{ card: any; gyIndex: number }> = [];
  for (let i = 0; i < graveyard.length; i++) {
    const c = graveyard[i];
    if (c && (isBerfomet(c) || isGazelle(c))) {
      out.push({ card: c, gyIndex: i });
    }
  }
  return out;
}
