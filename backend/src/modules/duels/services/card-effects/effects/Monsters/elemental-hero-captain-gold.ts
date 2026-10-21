/**
 * Elemental HERO Captain Gold / YGOPRO_80908502
 *
 * You can discard this card; add 1 "Skyscraper" from your Deck to your hand.
 * During your End Phase, if you do not control a face-up "Skyscraper": Destroy this card.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const ELEMENTAL_HERO_CAPTAIN_GOLD_KEY = 'elemental-hero-captain-gold';

export const ELEMENTAL_HERO_CAPTAIN_GOLD_IDS = [
  'ElementalHEROCaptainGold',
  'YGOPRO_80908502',
  '80908502',
] as const;

export const ELEMENTAL_HERO_CAPTAIN_GOLD_NAMES = [
  'elemental hero captain gold',
  'elemental-hero captain gold',
] as const;

export function isElementalHeroCaptainGold(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of ELEMENTAL_HERO_CAPTAIN_GOLD_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of ELEMENTAL_HERO_CAPTAIN_GOLD_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  return nameCompact.includes('elementalherocaptaingold') || id.includes('80908502');
}

export function isSkyscraper(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  return (
    nameCompact.includes('skyscraper') ||
    id.includes('63035430') ||
    id.includes('skyscraper')
  );
}

export function findSkyscraperInDeck(deck: any[] | undefined): number {
  if (!Array.isArray(deck)) return -1;
  for (let i = 0; i < deck.length; i++) {
    if (isSkyscraper(deck[i])) return i;
  }
  return -1;
}

export function hasSkyscraperFaceUp(field: any): boolean {
  if (!field?.spellTrap || !Array.isArray(field.spellTrap)) return false;
  for (const st of field.spellTrap) {
    if (!st) continue;
    const position = String(st.position || '').toLowerCase();
    const isFaceUp = position !== 'set';
    if (isFaceUp && isSkyscraper(st)) return true;
  }
  return false;
}

export function findCaptainGoldOnField(field: any): Array<{ card: any; zoneIndex: number }> {
  if (!field?.monsters || !Array.isArray(field.monsters)) return [];
  const out: Array<{ card: any; zoneIndex: number }> = [];
  for (let i = 0; i < field.monsters.length; i++) {
    const m = field.monsters[i];
    if (m && isElementalHeroCaptainGold(m)) {
      out.push({ card: m, zoneIndex: i });
    }
  }
  return out;
}
