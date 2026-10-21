/**
 * Buster Blader / Espadachim Destruidor
 *
 * Ganha 500 ATK por cada monstro Dragão que o oponente controla ou que esteja no GY dele.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const BUSTER_BLADER_KEY = 'buster-blader';

export const BUSTER_BLADER_IDS = [
  'BusterBlader',
  'YGOPRO_78193895',
  '78193895',
] as const;

export const BUSTER_BLADER_NAMES = [
  'buster blader',
  'espadachim destruidor',
] as const;

export function isBusterBlader(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  for (const k of BUSTER_BLADER_IDS) {
    if (id === compactCardKey(k) || id.includes(compactCardKey(k))) return true;
  }
  for (const k of BUSTER_BLADER_NAMES) {
    if (name === normalizeCardKey(k)) return true;
  }
  return (
    nameCompact.includes('busterblader') ||
    nameCompact.includes('espadachimdestruidor')
  );
}

export function isDragonMonster(card: any): boolean {
  if (!card) return false;
  const race = String(card.race || card.cardRace || '')
    .toUpperCase()
    .trim();
  if (!race) return false;
  return (
    race === 'DRAGON' ||
    race === 'DRAGÃO' ||
    race === 'DRAGAO' ||
    race.includes('DRAGON') ||
    race.includes('DRAGÃO') ||
    race.includes('DRAGAO')
  );
}

/** Conta Dragões no campo (inclui face-down) e no GY do oponente. */
export function countOpponentDragons(opponentField: any): number {
  if (!opponentField) return 0;
  let n = 0;
  const monsters = opponentField.monsters;
  if (Array.isArray(monsters)) {
    for (const m of monsters) {
      if (m && isDragonMonster(m)) n++;
    }
  }
  const gy = opponentField.graveyard;
  if (Array.isArray(gy)) {
    for (const c of gy) {
      if (c && isDragonMonster(c)) n++;
    }
  }
  return n;
}

/** Bônus de ATK do Buster Blader (+500 × Dragões do oponente no campo/GY). */
export function getBusterBladerAtkBonus(
  monster: any,
  opponentField: any,
): number {
  if (!monster || !isBusterBlader(monster)) return 0;
  const p = String(monster.position || '').toLowerCase();
  if (p === 'set' || p === 'face-down') return 0;
  return countOpponentDragons(opponentField) * 500;
}
