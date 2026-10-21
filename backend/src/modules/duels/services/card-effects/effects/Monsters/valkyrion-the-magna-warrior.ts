/**
 * Valkyrion the Magna Warrior / YGOPRO_75347539
 *
 * Cannot be Normal Summoned/Set. Must first be Special Summoned (from your hand) by Tributing
 * "Alpha The Magnet Warrior", "Beta The Magnet Warrior", and "Gamma The Magnet Warrior" you control.
 * You can Tribute this card; Special Summon "Alpha The Magnet Warrior", "Beta The Magnet Warrior",
 * and "Gamma The Magnet Warrior" from your GY.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const VALKYRION_THE_MAGNA_WARRIOR_KEY = 'valkyrion-the-magna-warrior';

export const VALKYRION_THE_MAGNA_WARRIOR_IDS = [
  'ValkyrionTheMagnaWarrior',
  'YGOPRO_75347539',
  '75347539',
] as const;

export const VALKYRION_THE_MAGNA_WARRIOR_NAMES = [
  'valkyrion the magna warrior',
] as const;

export function isValkyrionTheMagnaWarrior(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of VALKYRION_THE_MAGNA_WARRIOR_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of VALKYRION_THE_MAGNA_WARRIOR_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  return nameCompact.includes('valkyrionthemagnawarrior') || id.includes('75347539');
}

export function isAlphaTheMagnetWarrior(card: any): boolean {
  if (!card) return false;
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  return (
    nameCompact.includes('alphathemagnetwarrior') ||
    id.includes('99785935') ||
    id.includes('alphathemagnetwarrior')
  );
}

export function isBetaTheMagnetWarrior(card: any): boolean {
  if (!card) return false;
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  return (
    nameCompact.includes('betathemagnetwarrior') ||
    id.includes('39256679') ||
    id.includes('betathemagnetwarrior')
  );
}

export function isGammaTheMagnetWarrior(card: any): boolean {
  if (!card) return false;
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  return (
    nameCompact.includes('gammathemagnetwarrior') ||
    id.includes('11549357') ||
    id.includes('gammathemagnetwarrior')
  );
}

export function canSummonValkyrion(field: any, hand: any[] | undefined): boolean {
  if (!Array.isArray(hand)) return false;
  const hasValkyrionInHand = hand.some((c) => c && isValkyrionTheMagnaWarrior(c));
  if (!hasValkyrionInHand) return false;

  // Need Alpha, Beta, Gamma on field or in hand
  const allCards = [...(field?.monsters?.filter((m: any) => m) || []), ...hand];
  const hasAlpha = allCards.some((c) => isAlphaTheMagnetWarrior(c));
  const hasBeta = allCards.some((c) => isBetaTheMagnetWarrior(c));
  const hasGamma = allCards.some((c) => isGammaTheMagnetWarrior(c));

  return hasAlpha && hasBeta && hasGamma;
}

export function findMagnetWarriorsInGraveyard(graveyard: any[] | undefined): {
  alpha: number;
  beta: number;
  gamma: number;
} {
  const result = { alpha: -1, beta: -1, gamma: -1 };
  if (!Array.isArray(graveyard)) return result;
  for (let i = 0; i < graveyard.length; i++) {
    const c = graveyard[i];
    if (!c) continue;
    if (isAlphaTheMagnetWarrior(c) && result.alpha === -1) result.alpha = i;
    if (isBetaTheMagnetWarrior(c) && result.beta === -1) result.beta = i;
    if (isGammaTheMagnetWarrior(c) && result.gamma === -1) result.gamma = i;
  }
  return result;
}

export function canActivateValkyrionEffect(graveyard: any[] | undefined): boolean {
  const found = findMagnetWarriorsInGraveyard(graveyard);
  return found.alpha !== -1 && found.beta !== -1 && found.gamma !== -1;
}
