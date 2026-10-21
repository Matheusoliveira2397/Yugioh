/**
 * King's Knight
 *
 * When Normal Summoned while you control Queen's Knight: You can Special Summon 1 Jack's Knight from your Deck.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const KINGS_KNIGHT_KEY = 'kings-knight';

export const KINGS_KNIGHT_IDS = [
  'KingsKnight',
  'YGOPRO_64788463',
  '64788463',
] as const;

export const KINGS_KNIGHT_NAMES = [
  "king's knight",
  'kings knight',
  'cavaleiro rei',
] as const;

export const QUEENS_KNIGHT_IDS = [
  'QueensKnight',
  'YGOPRO_25652259',
  '25652259',
] as const;

export const QUEENS_KNIGHT_NAMES = [
  "queen's knight",
  'queens knight',
  'cavaleiro rainha',
] as const;

export const JACKS_KNIGHT_IDS = [
  'JacksKnight',
  'YGOPRO_90876561',
  '90876561',
] as const;

export const JACKS_KNIGHT_NAMES = [
  "jack's knight",
  'jacks knight',
  'cavaleiro valete',
] as const;

export function isKingsKnight(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of KINGS_KNIGHT_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of KINGS_KNIGHT_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('kingsknight') || nameCompact.includes('cavaleirorei') || id.includes('64788463')) {
    return true;
  }
  return false;
}

export function isQueensKnight(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of QUEENS_KNIGHT_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of QUEENS_KNIGHT_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('queensknight') || nameCompact.includes('cavaleirorainha') || id.includes('25652259')) {
    return true;
  }
  return false;
}

export function isJacksKnight(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of JACKS_KNIGHT_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of JACKS_KNIGHT_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('jacksknight') || nameCompact.includes('cavaleirovalete') || id.includes('90876561')) {
    return true;
  }
  return false;
}

export function hasQueensKnightOnField(
  field: any,
): boolean {
  if (!field?.monsters) return false;
  for (const m of field.monsters) {
    if (!m) continue;
    if (isQueensKnight(m)) return true;
  }
  return false;
}

export function listJacksKnightInDeck(
  deck: any[] | undefined,
): Array<{ card: any; deckIndex: number }> {
  if (!Array.isArray(deck)) return [];
  const out: Array<{ card: any; deckIndex: number }> = [];
  for (let i = 0; i < deck.length; i++) {
    const c = deck[i];
    if (!c) continue;
    if (!isJacksKnight(c)) continue;
    out.push({ card: c, deckIndex: i });
  }
  return out;
}
