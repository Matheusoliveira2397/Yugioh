/**
 * Dark Magician Girl / Pequena Maga Negra
 *
 * Ganha 300 ATK por cada "Dark Magician" ou "Magician of Black Chaos" no GY.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';
import {
  isDarkMagician,
  isDarkMagicianGirl,
} from '../spells/magicians-salvation';

export const DARK_MAGICIAN_GIRL_KEY = 'dark-magician-girl';

export const MAGICIAN_OF_BLACK_CHAOS_IDS = [
  'MagicianOfBlackChaos',
  'YGOPRO_30208479',
  '30208479',
] as const;

export const MAGICIAN_OF_BLACK_CHAOS_NAMES = [
  'magician of black chaos',
  'mago do caos negro',
  'mago negro do ritual',
] as const;

export function isMagicianOfBlackChaos(card: any): boolean {
  if (!card) return false;
  // Não confundir com Dark Magician of Chaos
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  if (nameCompact.includes('darkmagicianofchaos') || nameCompact.includes('magonegrodocaos')) {
    return false;
  }
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  for (const k of MAGICIAN_OF_BLACK_CHAOS_IDS) {
    if (id === compactCardKey(k)) return true;
  }
  for (const k of MAGICIAN_OF_BLACK_CHAOS_NAMES) {
    if (name === normalizeCardKey(k)) return true;
  }
  return (
    nameCompact === 'magicianofblackchaos' ||
    nameCompact.includes('magicianofblackchaos') ||
    nameCompact.includes('magodocaosnegro')
  );
}

export function countsForDarkMagicianGirlAtk(card: any): boolean {
  return isDarkMagician(card) || isMagicianOfBlackChaos(card);
}

export function countDmOrMobcInGraveyard(graveyard: any[] | undefined): number {
  if (!Array.isArray(graveyard)) return 0;
  let n = 0;
  for (const c of graveyard) {
    if (c && countsForDarkMagicianGirlAtk(c)) n++;
  }
  return n;
}

/** Bônus de ATK da Dark Magician Girl (+300 × DM/MoBC no GY do controlador). */
export function getDarkMagicianGirlAtkBonus(monster: any, ownerField: any): number {
  if (!monster || !isDarkMagicianGirl(monster)) return 0;
  const p = String(monster.position || '').toLowerCase();
  if (p === 'set' || p === 'face-down') return 0;
  return countDmOrMobcInGraveyard(ownerField?.graveyard) * 300;
}

export { isDarkMagicianGirl, isDarkMagician };
