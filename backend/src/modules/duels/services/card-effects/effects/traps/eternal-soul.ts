/**
 * Eternal Soul / Alma Eterna (Continuous Trap)
 *
 * 1) Contínuo: todo "Dark Magician" na sua Monster Zone é imune a efeitos do oponente.
 * 2) Se esta carta face-up sair do campo: destrua todos os monstros que você controla.
 * 3) 1x/turno — ative 1:
 *    ● Invocar Especial 1 "Dark Magician" da mão ou GY.
 *    ● Adicionar 1 "Dark Magic Attack" ou "Thousand Knives" do Deck à mão.
 */

import { SimpleCardEffectFunction, CardEffectContext } from '../../interfaces/card-effect.interface';
import { logger } from '../../../../../../common/utils/logger.util';
import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';
import {
  isDarkMagician,
  isEternalSoul as isEternalSoulFromSalvation,
} from '../spells/magicians-salvation';

export const ETERNAL_SOUL_KEY = 'eternal-soul';

export { isDarkMagician };

export function isEternalSoul(card: any): boolean {
  return isEternalSoulFromSalvation(card);
}

export const DARK_MAGIC_ATTACK_IDS = [
  'DarkMagicAttack',
  'YGOPRO_41750981',
  '41750981',
  'YGOPRO_40670821',
  '40670821',
] as const;

export const DARK_MAGIC_ATTACK_NAMES = [
  'dark magic attack',
  'ataque de magia negra',
] as const;

export const THOUSAND_KNIVES_IDS = [
  'ThousandKnives',
  'YGOPRO_63356631',
  '63356631',
] as const;

export const THOUSAND_KNIVES_NAMES = ['thousand knives', 'mil facas', 'mil facas'] as const;

export function isDarkMagicAttack(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  for (const k of DARK_MAGIC_ATTACK_IDS) {
    if (id === compactCardKey(k) || id.includes(compactCardKey(k))) return true;
  }
  for (const k of DARK_MAGIC_ATTACK_NAMES) {
    if (name === normalizeCardKey(k)) return true;
  }
  return nameCompact.includes('darkmagicattack') || nameCompact.includes('ataquedemagianegra');
}

export function isThousandKnives(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  for (const k of THOUSAND_KNIVES_IDS) {
    if (id === compactCardKey(k) || id.includes(compactCardKey(k))) return true;
  }
  for (const k of THOUSAND_KNIVES_NAMES) {
    if (name === normalizeCardKey(k)) return true;
  }
  return nameCompact.includes('thousandknives') || nameCompact.includes('milfacas');
}

export function isDarkMagicAttackOrThousandKnives(card: any): boolean {
  return isDarkMagicAttack(card) || isThousandKnives(card);
}

export function hasFaceUpEternalSoul(playerField: any): boolean {
  if (!playerField?.spellTrap || !Array.isArray(playerField.spellTrap)) return false;
  for (const st of playerField.spellTrap) {
    if (!st) continue;
    if (!isEternalSoul(st)) continue;
    const pos = String(st.position || '').toLowerCase();
    if (pos === 'face-up' || pos === 'activated') return true;
  }
  return false;
}

export function findFaceUpEternalSoulZone(playerField: any): number {
  if (!playerField?.spellTrap || !Array.isArray(playerField.spellTrap)) return -1;
  for (let i = 0; i < playerField.spellTrap.length; i++) {
    const st = playerField.spellTrap[i];
    if (!st || !isEternalSoul(st)) continue;
    const pos = String(st.position || '').toLowerCase();
    if (pos === 'face-up' || pos === 'activated') return i;
  }
  return -1;
}

/**
 * Dark Magician do controlador é imune a efeitos do oponente se Eternal Soul face-up.
 */
export function isDarkMagicianUnaffectedByOpponent(
  duel: any,
  monsterOwnerIsPlayer1: boolean,
  monster: any,
): boolean {
  if (!monster || !isDarkMagician(monster)) return false;
  const ownerField = monsterOwnerIsPlayer1
    ? (duel as any)?.player1Field
    : (duel as any)?.player2Field;
  return hasFaceUpEternalSoul(ownerField);
}

export function canUseEternalSoulEffectThisTurn(
  playerField: any,
  turnCounter: number,
): boolean {
  return Number(playerField?.eternalSoulEffectUsedTurn) !== Number(turnCounter);
}

export function markEternalSoulEffectUsed(playerField: any, turnCounter: number): void {
  playerField.eternalSoulEffectUsedTurn = turnCounter;
}

export function listDarkMagiciansInHandOrGy(playerField: any): Array<{
  source: 'hand' | 'graveyard';
  index: number;
  card: any;
}> {
  const out: Array<{ source: 'hand' | 'graveyard'; index: number; card: any }> = [];
  const hand = playerField?.hand || [];
  for (let i = 0; i < hand.length; i++) {
    if (hand[i] && isDarkMagician(hand[i])) {
      out.push({ source: 'hand', index: i, card: hand[i] });
    }
  }
  const gy = playerField?.graveyard || [];
  for (let i = 0; i < gy.length; i++) {
    if (gy[i] && isDarkMagician(gy[i])) {
      out.push({ source: 'graveyard', index: i, card: gy[i] });
    }
  }
  return out;
}

export function listDarkMagicAttackOrKnivesInDeck(
  deck: any[] | undefined,
): Array<{ card: any; deckIndex: number }> {
  if (!Array.isArray(deck)) return [];
  const out: Array<{ card: any; deckIndex: number }> = [];
  for (let i = 0; i < deck.length; i++) {
    if (deck[i] && isDarkMagicAttackOrThousandKnives(deck[i])) {
      out.push({ card: deck[i], deckIndex: i });
    }
  }
  return out;
}

export function findEmptyMonsterZone(monsters: any[] | undefined): number {
  if (!Array.isArray(monsters)) return -1;
  for (let i = 0; i < Math.min(5, monsters.length); i++) {
    if (monsters[i] == null) return i;
  }
  return -1;
}

/** Continuous Trap: ao ativar, permanece no campo. */
export const createEternalSoulEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    logger.info(`✨ [Eternal Soul] Continuous Trap ativada — permanece no campo (zona ${zoneIndex})`);

    await (duelsService as any).syncDuelState?.(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });

    return {
      success: true,
      createdPendingChoice: false,
      message: 'Eternal Soul ativada — permanece no campo',
    };
  };
};
