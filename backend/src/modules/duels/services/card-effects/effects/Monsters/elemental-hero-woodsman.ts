/**
 * Elemental HERO Woodsman / YGOPRO_75434695
 *
 * During your Standby Phase: You can add 1 "Polymerization" from your Deck or GY to your hand.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const ELEMENTAL_HERO_WOODSMAN_KEY = 'elemental-hero-woodsman';

export const ELEMENTAL_HERO_WOODSMAN_IDS = [
  'ElementalHEROWoodsman',
  'YGOPRO_75434695',
  '75434695',
] as const;

export const ELEMENTAL_HERO_WOODSMAN_NAMES = [
  'elemental hero woodsman',
  'elemental-hero woodsman',
] as const;

export function isElementalHeroWoodsman(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of ELEMENTAL_HERO_WOODSMAN_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of ELEMENTAL_HERO_WOODSMAN_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  return nameCompact.includes('elementalherowoodsman') || id.includes('75434695');
}

export function isPolymerization(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  return (
    nameCompact.includes('polymerization') ||
    nameCompact.includes('polimerizacao') ||
    id.includes('24094653') ||
    id.includes('polymerization')
  );
}

export function findWoodsmanOnField(field: any): { card: any; zoneIndex: number } | null {
  if (!field?.monsters || !Array.isArray(field.monsters)) return null;
  for (let i = 0; i < field.monsters.length; i++) {
    const m = field.monsters[i];
    if (m && isElementalHeroWoodsman(m)) {
      const position = String(m.position || '').toLowerCase();
      const isFaceUp = position === 'attack' || position === 'defense' || position === 'face-up';
      if (isFaceUp) {
        return { card: m, zoneIndex: i };
      }
    }
  }
  return null;
}

export function listPolymerizationInDeckOrGy(field: any): Array<{
  source: 'deck' | 'graveyard';
  index: number;
  card: any;
}> {
  const out: Array<{ source: 'deck' | 'graveyard'; index: number; card: any }> = [];
  const scanDeck = (arr: any[] | undefined) => {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] && isPolymerization(arr[i])) {
        out.push({ source: 'deck', index: i, card: arr[i] });
      }
    }
  };
  const scanGy = (arr: any[] | undefined) => {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] && isPolymerization(arr[i])) {
        out.push({ source: 'graveyard', index: i, card: arr[i] });
      }
    }
  };
  scanDeck(field?.deck);
  scanGy(field?.graveyard);
  return out;
}
