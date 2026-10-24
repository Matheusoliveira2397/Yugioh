import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';
import * as EternalSoul from '../effects/traps/eternal-soul';

/** Registered effect action; public API remains on DuelsService. */
export async function processEternalSoulSearch(host: DuelsService, duelId: string | number, userId: number, deckIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = host['activeDuels'].get(duelIdStr) || (await host['findDuelByIdFromDatabase'](duelIdStr));
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const pending = (duel as any).pendingChoice;
    if (!pending || pending.type !== 'ETERNAL_SOUL_EFFECT' || Number(pending.userId) !== Number(userId)) {
      return { success: false, message: 'Escolha inválida' };
    }
    if (!pending.data?.canSearch) {
      return { success: false, message: 'Busca indisponível' };
    }

    const isPlayer1 = Number(duel.player1Id) === Number(userId);
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const deck = playerField.deck || [];
    if (
      deckIndex < 0 ||
      deckIndex >= deck.length ||
      !EternalSoul.isDarkMagicAttackOrThousandKnives(deck[deckIndex])
    ) {
      return { success: false, message: 'Carta inválida no deck' };
    }

    const [picked] = deck.splice(deckIndex, 1);
    if (!playerField.hand) playerField.hand = [];
    playerField.hand.push(picked);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    playerField.deck = deck;

    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    EternalSoul.markEternalSoulEffectUsed(playerField, turnCounter);

    await host['clearPendingChoice'](duelIdStr, false);
    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);
    host['activeDuels'].set(duelIdStr, duel);

    const name = picked.name || picked.cardName || 'carta';
    logger.info(`✨ [Eternal Soul] adicionou "${name}" à mão`);
    return { success: true, message: `Adicionou ${name} à mão` };
  }
