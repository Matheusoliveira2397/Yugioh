/**
 * Magician's Salvation / Salvação do Mago (Field Spell)
 *
 * 1) Ao ativar: você pode Baixar 1 "Eternal Soul" diretamente do Deck.
 * 2) Se você Invocar Normal/Especial "Dark Magician" ou "Dark Magician Girl":
 *    alvo 1 desses; Invocar Especial do GY o outro nome (1x/turno).
 * 3) Só pode ativar 1 "Magician's Salvation" por turno.
 */

import { SimpleCardEffectFunction, CardEffectContext } from '../../interfaces/card-effect.interface';
import { logger } from '../../../../../../common/utils/logger.util';
import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const MAGICIAN_S_SALVATION_KEY = 'magicians-salvation';

export const MAGICIAN_S_SALVATION_IDS = [
  'MagiciansSalvation',
  'MagicianSSalvation',
  'YGOPRO_35158295',
  '35158295',
] as const;

export const MAGICIAN_S_SALVATION_NAMES = [
  "magician's salvation",
  'magicians salvation',
  'salvacao do mago',
  'salvação do mago',
] as const;

export const ETERNAL_SOUL_IDS = [
  'EternalSoul',
  'YGOPRO_48680900',
  '48680900',
] as const;

export const ETERNAL_SOUL_NAMES = ['eternal soul', 'alma eterna'] as const;

export const DARK_MAGICIAN_IDS = [
  'DarkMagician',
  'YGOPRO_46986414',
  '46986414',
] as const;

export const DARK_MAGICIAN_NAMES = ['dark magician', 'mago negro'] as const;

export const DARK_MAGICIAN_GIRL_IDS = [
  'DarkMagicianGirl',
  'YGOPRO_38033121',
  '38033121',
] as const;

export const DARK_MAGICIAN_GIRL_NAMES = [
  'dark magician girl',
  'pequena maga negra',
  'maga negra',
] as const;

export function isMagiciansSalvation(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  for (const k of MAGICIAN_S_SALVATION_IDS) {
    if (id === compactCardKey(k) || id.includes(compactCardKey(k))) return true;
  }
  for (const k of MAGICIAN_S_SALVATION_NAMES) {
    if (name === normalizeCardKey(k)) return true;
  }
  return nameCompact.includes('magicianssalvation') || nameCompact.includes('salvacaodomago');
}

export function isEternalSoul(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  for (const k of ETERNAL_SOUL_IDS) {
    if (id === compactCardKey(k) || id.includes(compactCardKey(k))) return true;
  }
  for (const k of ETERNAL_SOUL_NAMES) {
    if (name === normalizeCardKey(k)) return true;
  }
  return nameCompact.includes('eternalsoul') || nameCompact.includes('almaeterna');
}

/** Dark Magician (não Girl / não of Chaos). */
export function isDarkMagician(card: any): boolean {
  if (!card) return false;
  if (isDarkMagicianGirl(card)) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  if (nameCompact.includes('ofchaos') || nameCompact.includes('docaos')) return false;
  for (const k of DARK_MAGICIAN_IDS) {
    if (id === compactCardKey(k)) return true;
  }
  for (const k of DARK_MAGICIAN_NAMES) {
    if (name === normalizeCardKey(k)) return true;
  }
  // id parcial YGOPRO sem girl/chaos
  if (id.includes('46986414')) return true;
  if (nameCompact === 'darkmagician' || nameCompact === 'magonegro') return true;
  return false;
}

export function isDarkMagicianGirl(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  for (const k of DARK_MAGICIAN_GIRL_IDS) {
    if (id === compactCardKey(k) || id.includes(compactCardKey(k))) return true;
  }
  for (const k of DARK_MAGICIAN_GIRL_NAMES) {
    if (name === normalizeCardKey(k)) return true;
  }
  return (
    nameCompact.includes('darkmagiciangirl') ||
    nameCompact.includes('pequenamaganegra') ||
    (nameCompact.includes('maganegra') && !nameCompact.includes('magonegro'))
  );
}

export function isDarkMagicianOrGirl(card: any): boolean {
  return isDarkMagician(card) || isDarkMagicianGirl(card);
}

export function findEternalSoulInDeck(
  deck: any[] | undefined,
): Array<{ card: any; deckIndex: number }> {
  if (!Array.isArray(deck)) return [];
  const out: Array<{ card: any; deckIndex: number }> = [];
  for (let i = 0; i < deck.length; i++) {
    if (deck[i] && isEternalSoul(deck[i])) out.push({ card: deck[i], deckIndex: i });
  }
  return out;
}

export function findEmptySpellTrapZone(spellTrap: any[] | undefined): number {
  if (!Array.isArray(spellTrap)) return -1;
  for (let i = 0; i < Math.min(5, spellTrap.length); i++) {
    if (spellTrap[i] == null) return i;
  }
  return -1;
}

export function findEmptyMonsterZone(monsters: any[] | undefined): number {
  if (!Array.isArray(monsters)) return -1;
  for (let i = 0; i < Math.min(5, monsters.length); i++) {
    if (monsters[i] == null) return i;
  }
  return -1;
}

/** No GY, carta com nome diferente do monstro alvo (DM ↔ DMG). */
export function findPairInGraveyard(
  graveyard: any[] | undefined,
  targetMonster: any,
): { card: any; index: number } | null {
  if (!Array.isArray(graveyard) || !targetMonster) return null;
  const wantGirl = isDarkMagician(targetMonster);
  const wantDm = isDarkMagicianGirl(targetMonster);
  if (!wantGirl && !wantDm) return null;
  for (let i = 0; i < graveyard.length; i++) {
    const c = graveyard[i];
    if (!c) continue;
    if (wantGirl && isDarkMagicianGirl(c)) return { card: c, index: i };
    if (wantDm && isDarkMagician(c)) return { card: c, index: i };
  }
  return null;
}

export function hasFaceUpMagiciansSalvation(playerField: any): boolean {
  const field = playerField?.field;
  if (!field) return false;
  if (!isMagiciansSalvation(field)) return false;
  const pos = String(field.position || 'face-up').toLowerCase();
  return pos === 'face-up' || pos === 'attack' || pos === 'defense' || !field.position;
}

export function canActivateSalvationThisTurn(playerField: any, turnCounter: number): boolean {
  return Number(playerField?.magiciansSalvationActivatedTurn) !== Number(turnCounter);
}

export function canUseSalvationPairThisTurn(playerField: any, turnCounter: number): boolean {
  return Number(playerField?.magiciansSalvationPairUsedTurn) !== Number(turnCounter);
}

/**
 * Efeito de ativação: permanece no campo (Field Spell) + oferta Eternal Soul.
 */
export const createMagiciansSalvationEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1 } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const turnCounter =
      Number(duel?.turnCounter) ||
      Number(playerField?.turnCounter) ||
      1;

    playerField.magiciansSalvationActivatedTurn = turnCounter;
    logger.info(`✨ [Magician's Salvation] Field Spell ativada (turno ${turnCounter})`);

    await (duelsService as any).syncDuelState?.(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });

    // Oferta opcional: Set Eternal Soul do Deck
    let createdPending = false;
    if (typeof duelsService.tryStartMagiciansSalvationEternalSoul === 'function') {
      createdPending = await duelsService.tryStartMagiciansSalvationEternalSoul(
        duelId,
        duel,
        isPlayer1,
      );
    }

    return {
      success: true,
      createdPendingChoice: createdPending,
      message: createdPending
        ? "Magician's Salvation: escolha Eternal Soul do deck (opcional)"
        : "Magician's Salvation ativada",
    };
  };
};
