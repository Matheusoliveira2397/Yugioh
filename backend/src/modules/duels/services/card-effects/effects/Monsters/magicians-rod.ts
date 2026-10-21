/**
 * Magician's Rod / Bastão do Mago
 *
 * 1) Quando Invocado por Invocação-Normal: você pode adicionar 1 Magia/Armadilha do Deck
 *    que liste especificamente "Mago Negro" / "Dark Magician" no texto (1x/turno).
 * 2) No turno do oponente, se você ativar um Card/efeito de Magia/Armadilha enquanto
 *    este card estiver no GY (exceto Etapa de Dano): Tributar 1 monstro Mago;
 *    adicione este card à mão (1x/turno).
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const MAGICIAN_S_ROD_KEY = 'magicians-rod';

export const MAGICIAN_S_ROD_CARD_IDS = [
  'MagiciansRod',
  'MagicianSRod',
  'YGOPRO_7084129',
  '7084129',
] as const;

export const MAGICIAN_S_ROD_CARD_NAMES = [
  "magician's rod",
  'magicians rod',
  'bastao do mago',
  'bastão do mago',
] as const;

/** Fallback: S/T conhecidas que listam Dark Magician (quando description falta no deck). */
export const DARK_MAGICIAN_LISTING_ST_IDS = [
  'DarkMagicalCircle',
  'YGOPRO_47222536',
  '47222536',
  'EternalSoul',
  'YGOPRO_48680900',
  '48680900',
  'MagicianNavigation',
  'YGOPRO_40318957',
  '40318957',
  'DarkMagicAttack',
  'YGOPRO_41750981', // may vary
  'DarkMagicCurtain',
  'ThousandKnives',
  'DedicationThroughLightAndPower',
  'BondBetweenTeacherAndStudent',
  'SoulServant',
  'DarkBurningMagic',
  'IllusionMagic',
  'DarkMagicInheritance',
  'DarkMagicExpanded',
  'MagiciansSalvation',
  'SecretsOfDarkMagic',
] as const;

export const DARK_MAGICIAN_LISTING_ST_NAMES = [
  'dark magical circle',
  'circulo magico das trevas',
  'círculo mágico das trevas',
  'eternal soul',
  'alma eterna',
  'magician navigation',
  'navegacao do mago',
  'navegação do mago',
  'dark magic attack',
  'ataque de magia negra',
  'dark magic curtain',
  'cortina de magia negra',
  'thousand knives',
  'mil facas',
  'dedication through light and power',
  'bond between teacher and student',
  'soul servant',
  'dark burning magic',
  'illusion magic',
  'dark magic inheritance',
  'dark magic expanded',
  "magician's salvation",
  'secrets of dark magic',
] as const;

export function isMagiciansRod(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of MAGICIAN_S_ROD_CARD_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of MAGICIAN_S_ROD_CARD_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('magiciansrod') || nameCompact.includes('bastaodomago')) {
    return true;
  }
  if (id.includes('magiciansrod') || id.includes('7084129')) {
    return true;
  }
  return false;
}

export function isSpellOrTrapCard(card: any): boolean {
  if (!card) return false;
  const t = String(card.type || card.cardType || card.frameType || '').toLowerCase();
  if (t.includes('monster') || t.includes('monstro')) return false;
  return (
    t.includes('spell') ||
    t.includes('magia') ||
    t.includes('trap') ||
    t.includes('armadilha')
  );
}

export function isSpellcasterMonster(card: any): boolean {
  if (!card) return false;
  const race = String(card.race || card.cardRace || '').toUpperCase().trim();
  return (
    race === 'SPELLCASTER' ||
    race === 'MAGO' ||
    race.includes('SPELLCASTER') ||
    race.includes('MAGO')
  );
}

/**
 * Lista especificamente "Dark Magician" / "Mago Negro" no texto
 * (não conta só "Dark Magician Girl" / "Mago Negro do Caos" / "Pequena Maga Negra").
 */
export function listsDarkMagicianInText(card: any): boolean {
  if (!card) return false;

  const text = String(
    card.description || card.desc || card.cardText || card.effect || '',
  );
  if (text) {
    const en = /\bdark magician\b(?!\s*(?:girl|of chaos))/i;
    const pt = /\bmago negro\b(?!\s*do caos)/i;
    if (en.test(text) || pt.test(text)) return true;
  }

  // Fallback por id/nome conhecidos
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  for (const known of DARK_MAGICIAN_LISTING_ST_IDS) {
    if (id === compactCardKey(known) || id.includes(compactCardKey(known))) return true;
  }
  for (const known of DARK_MAGICIAN_LISTING_ST_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  return false;
}

export function listDarkMagicianSpellsTrapsInDeck(
  deck: any[] | undefined,
): Array<{ card: any; deckIndex: number }> {
  if (!Array.isArray(deck)) return [];
  const out: Array<{ card: any; deckIndex: number }> = [];
  for (let i = 0; i < deck.length; i++) {
    const c = deck[i];
    if (!c) continue;
    if (!isSpellOrTrapCard(c)) continue;
    if (!listsDarkMagicianInText(c)) continue;
    out.push({ card: c, deckIndex: i });
  }
  return out;
}

export function findMagiciansRodInGraveyard(
  graveyard: any[] | undefined,
): { card: any; index: number } | null {
  if (!Array.isArray(graveyard)) return null;
  for (let i = 0; i < graveyard.length; i++) {
    if (graveyard[i] && isMagiciansRod(graveyard[i])) {
      return { card: graveyard[i], index: i };
    }
  }
  return null;
}

export function listSpellcastersOnField(
  monsters: any[] | undefined,
): Array<{ monster: any; zoneIndex: number }> {
  if (!Array.isArray(monsters)) return [];
  const out: Array<{ monster: any; zoneIndex: number }> = [];
  for (let i = 0; i < monsters.length; i++) {
    const m = monsters[i];
    if (!m) continue;
    if (!isSpellcasterMonster(m)) continue;
    out.push({ monster: m, zoneIndex: i });
  }
  return out;
}

export function canUseRodSearchThisTurn(playerField: any, turnCounter: number): boolean {
  return Number(playerField?.magiciansRodSearchUsedTurn) !== Number(turnCounter);
}

export function canUseRodGyThisTurn(playerField: any, turnCounter: number): boolean {
  return Number(playerField?.magiciansRodGyUsedTurn) !== Number(turnCounter);
}

export function markRodSearchUsed(playerField: any, turnCounter: number): void {
  playerField.magiciansRodSearchUsedTurn = turnCounter;
}

export function markRodGyUsed(playerField: any, turnCounter: number): void {
  playerField.magiciansRodGyUsedTurn = turnCounter;
}
