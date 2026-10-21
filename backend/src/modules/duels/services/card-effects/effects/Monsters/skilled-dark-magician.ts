/**
 * Skilled Dark Magician / Mago Negro Experiente
 *
 * Cada vez que uma Magia é ativada, coloque 1 Marcador de Magia neste card
 * quando essa Magia resolver (máx. 3). Você pode Tributar este card com 3
 * Marcadores; Invocar Especial 1 "Dark Magician" da mão, Deck ou GY.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';
import { isDarkMagician } from '../spells/magicians-salvation';

export const SKILLED_DARK_MAGICIAN_KEY = 'skilled-dark-magician';

export const SKILLED_DARK_MAGICIAN_IDS = [
  'SkilledDarkMagician',
  'YGOPRO_73752131',
  '73752131',
] as const;

export const SKILLED_DARK_MAGICIAN_NAMES = [
  'skilled dark magician',
  'mago negro experiente',
] as const;

export function isSkilledDarkMagician(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  for (const k of SKILLED_DARK_MAGICIAN_IDS) {
    if (id === compactCardKey(k) || id.includes(compactCardKey(k))) return true;
  }
  for (const k of SKILLED_DARK_MAGICIAN_NAMES) {
    if (name === normalizeCardKey(k)) return true;
  }
  return (
    nameCompact.includes('skilleddarkmagician') ||
    nameCompact.includes('magonegroexperiente')
  );
}

export function isFaceUpSkilledDarkMagician(card: any): boolean {
  if (!isSkilledDarkMagician(card)) return false;
  const p = String(card.position || '').toLowerCase();
  return p === 'attack' || p === 'defense' || p === 'face-up';
}

/** Adiciona 1 marcador (máx. 3) em todos os Skilled Dark Magician face-up do controlador da Magia. */
export function addSpellCountersOnSpellResolve(playerField: any): number {
  if (!playerField?.monsters || !Array.isArray(playerField.monsters)) return 0;
  let added = 0;
  for (const m of playerField.monsters) {
    if (!isFaceUpSkilledDarkMagician(m)) continue;
    const cur = Number(m.spellCounters) || 0;
    if (cur >= 3) continue;
    m.spellCounters = cur + 1;
    added++;
  }
  return added;
}

export function listDarkMagiciansFromHandDeckGy(playerField: any): Array<{
  source: 'hand' | 'deck' | 'graveyard';
  index: number;
  card: any;
}> {
  const out: Array<{ source: 'hand' | 'deck' | 'graveyard'; index: number; card: any }> = [];
  const scan = (arr: any[] | undefined, source: 'hand' | 'deck' | 'graveyard') => {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] && isDarkMagician(arr[i])) {
        out.push({ source, index: i, card: arr[i] });
      }
    }
  };
  scan(playerField?.hand, 'hand');
  scan(playerField?.deck, 'deck');
  scan(playerField?.graveyard, 'graveyard');
  return out;
}

export function findEmptyMonsterZone(monsters: any[] | undefined): number {
  if (!Array.isArray(monsters)) return -1;
  for (let i = 0; i < Math.min(5, monsters.length); i++) {
    if (monsters[i] == null) return i;
  }
  return -1;
}

export { isDarkMagician };
