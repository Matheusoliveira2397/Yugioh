/**
 * Política de mão inspirada em Tag Force / WindBot:
 * - Limite de mão = 6 no fim do turno → descartar é perda de vantagem
 * - Com mão cheia/quase cheia: preferir gastar cartas (ativar/setar/invocar)
 *   em vez de comprar mais ou passar o turno
 */

import { BotActionCandidate } from './bot-action.types';
import { classifyCardEffect, hasRole } from './bot-effect-taxonomy';

export const HAND_SIZE_LIMIT = 6;

export function handSize(duel: any, botUserId: number): number {
  const isP1 = Number(duel.player1Id) === Number(botUserId);
  const own = isP1 ? duel.player1Field : duel.player2Field;
  return Array.isArray(own?.hand) ? own.hand.length : 0;
}

/** Cartas a mais que serão descartadas se passar o turno agora. */
export function overflowIfEndTurn(handCount: number): number {
  return Math.max(0, handCount - HAND_SIZE_LIMIT);
}

/**
 * Ajuste de score por tamanho de mão (Tag Force: CPU costuma desperdiçar mão;
 * nós penalizamos isso de propósito).
 */
export function handSizeScoreAdjust(
  action: BotActionCandidate,
  handCount: number,
  skill: number,
): { delta: number; note?: string } {
  const overflow = overflowIfEndTurn(handCount);
  const nearFull = handCount >= HAND_SIZE_LIMIT;
  const almostFull = handCount >= HAND_SIZE_LIMIT - 1; // 5+

  // Passar turno com overflow = mau
  if (action.actionType === 'END_TURN' && overflow > 0) {
    return {
      delta: -80 * overflow * (0.7 + 0.5 * skill),
      note: `evitar descarte de ${overflow} carta(s)`,
    };
  }

  // Comprar com mão cheia/quase cheia = pior
  const isDrawish =
    action.category === 'spell' &&
    (/pot|greed|upstart|jarofgreed|graceful|reload|card.?destruction|compra|draw/i.test(
      action.label + String(action.actionData?.cardName || ''),
    ) ||
      (() => {
        const p = classifyCardEffect({
          name: action.actionData?.cardName,
          idCarta: action.actionData?.cardId,
        });
        return hasRole(p, 'draw') || hasRole(p, 'discard_draw');
      })());

  if (isDrawish && almostFull) {
    return {
      delta: nearFull ? -100 * skill : -55 * skill,
      note: 'mão cheia — não comprar',
    };
  }

  // Gastar cartas da mão quando overflow iminente
  if (overflow > 0 || nearFull) {
    if (action.category === 'spell' && action.actionType === 'ACTIVATE_SPELL_TRAP') {
      return { delta: 35 + overflow * 15, note: 'gastar mão (evitar discard)' };
    }
    if (action.actionType === 'SET_SPELL_TRAP') {
      return { delta: 40 + overflow * 12, note: 'setar para aliviar mão' };
    }
    if (action.category === 'summon') {
      return { delta: 25 + overflow * 10, note: 'invocar para aliviar mão' };
    }
    if (action.category === 'monster_effect') {
      return { delta: 20 + overflow * 8, note: 'efeito para aliviar pressão de mão' };
    }
  }

  return { delta: 0 };
}

/** Há jogadas úteis para gastar mão antes de passar? */
export function hasHandReliefPlays(legal: BotActionCandidate[], handCount: number): boolean {
  if (handCount <= HAND_SIZE_LIMIT) return false;
  return legal.some(
    (a) =>
      a.category === 'spell' ||
      a.actionType === 'SET_SPELL_TRAP' ||
      a.category === 'summon' ||
      a.category === 'monster_effect',
  );
}
