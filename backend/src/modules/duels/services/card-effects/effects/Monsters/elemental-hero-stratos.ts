/**
 * Elemental HERO Stratos / YGOPRO_40044918
 *
 * When this card is Normal or Special Summoned:
 * - You can destroy Spell/Trap Cards on the field, up to the number of "HERO" monsters you control, other than this card.
 * - OR you can add 1 "HERO" monster from your Deck to your hand.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const ELEMENTAL_HERO_STRATOS_KEY = 'elemental-hero-stratos';

export const ELEMENTAL_HERO_STRATOS_IDS = [
  'ElementalHEROStratos',
  'YGOPRO_40044918',
  '40044918',
] as const;

export const ELEMENTAL_HERO_STRATOS_NAMES = [
  'elemental hero stratos',
  'elemental-hero stratos',
] as const;

export function isElementalHeroStratos(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of ELEMENTAL_HERO_STRATOS_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of ELEMENTAL_HERO_STRATOS_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  return nameCompact.includes('elementalherostratos') || id.includes('40044918');
}

export function isHeroMonster(card: any): boolean {
  if (!card) return false;
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  return (
    nameCompact.includes('hero') ||
    nameCompact.includes('elemental') ||
    name.includes('hero')
  );
}

export function countOtherHeroesOnField(field: any, excludeCard: any): number {
  if (!field?.monsters || !Array.isArray(field.monsters)) return 0;
  let count = 0;
  for (const m of field.monsters) {
    if (!m || m === excludeCard) continue;
    if (isHeroMonster(m)) count++;
  }
  return count;
}

export function listHeroMonstersInDeck(
  deck: any[] | undefined,
): Array<{ card: any; deckIndex: number }> {
  if (!Array.isArray(deck)) return [];
  const out: Array<{ card: any; deckIndex: number }> = [];
  for (let i = 0; i < deck.length; i++) {
    const c = deck[i];
    if (!c) continue;
    if (!isHeroMonster(c)) continue;
    out.push({ card: c, deckIndex: i });
  }
  return out;
}

export function listSpellTrapCardsOnBothFields(duel: any): Array<{
  card: any;
  owner: 'player1' | 'player2';
  zoneIndex: number;
}> {
  const out: Array<{ card: any; owner: 'player1' | 'player2'; zoneIndex: number }> = [];
  const scanField = (field: any, owner: 'player1' | 'player2') => {
    if (!field?.spellTrap || !Array.isArray(field.spellTrap)) return;
    for (let i = 0; i < field.spellTrap.length; i++) {
      const st = field.spellTrap[i];
      if (st) {
        out.push({ card: st, owner, zoneIndex: i });
      }
    }
  };
  scanField(duel.player1Field, 'player1');
  scanField(duel.player2Field, 'player2');
  return out;
}
