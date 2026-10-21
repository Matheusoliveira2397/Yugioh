/**
 * Kuriboh
 *
 * Durante o cálculo de dano, se o monstro do oponente atacar (Quick Effect):
 * Você pode descartar esta carta; você não recebe dano de batalha dessa batalha.
 *
 * Neste engine: ativo automaticamente (como Defense Draw) quando o defensor
 * sofreria dano de batalha e tem Kuriboh na mão.
 */

import { logger } from '../../../../../../common/utils/logger.util';
import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';
import type { Duel } from '../../../../entities/duel.entity';

export const KURIBOH_KEY = 'kuriboh';

export const KURIBOH_IDS = [
  'Kuriboh',
  'YGOPRO_40640057',
  '40640057',
] as const;

export const KURIBOH_NAMES = ['kuriboh'] as const;

export function isKuriboh(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);
  for (const k of KURIBOH_IDS) {
    if (id === compactCardKey(k) || id.includes(compactCardKey(k))) return true;
  }
  for (const k of KURIBOH_NAMES) {
    if (name === normalizeCardKey(k)) return true;
  }
  return nameCompact === 'kuriboh' || nameCompact.includes('kuriboh');
}

export function findKuribohInHand(
  hand: any[] | undefined,
): { card: any; index: number } | null {
  if (!Array.isArray(hand)) return null;
  for (let i = 0; i < hand.length; i++) {
    if (hand[i] && isKuriboh(hand[i])) {
      return { card: hand[i], index: i };
    }
  }
  return null;
}

/**
 * Descarta Kuriboh da mão do defensor e previne o dano de batalha.
 * @returns true se ativou e o dano deve ser 0
 */
export async function checkAndActivateKuriboh(
  host: any,
  duelId: string | number,
  duel: Duel,
  isAttackerPlayer1: boolean,
  damageAmount: number,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

  if (damageAmount <= 0) return false;

  const defenderField = isAttackerPlayer1
    ? (duel as any).player2Field
    : (duel as any).player1Field;

  if (!defenderField) return false;

  const found = findKuribohInHand(defenderField.hand);
  if (!found) return false;

  logger.info(
    `⭐ [Kuriboh] Ativado! Descartando da mão e prevenindo ${damageAmount} de dano de batalha`,
  );

  const [discarded] = defenderField.hand.splice(found.index, 1);
  if (!defenderField.graveyard) defenderField.graveyard = [];
  defenderField.graveyard.push(discarded);

  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);
  host.activeDuels.set(duelIdStr, duel);

  logger.info(`✅ [Kuriboh] Descartado para o GY — dano de batalha = 0`);
  return true;
}
