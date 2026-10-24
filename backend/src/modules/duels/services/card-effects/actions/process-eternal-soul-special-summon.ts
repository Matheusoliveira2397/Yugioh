import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';
import * as EternalSoul from '../effects/traps/eternal-soul';

/** Registered effect action; public API remains on DuelsService. */
export async function processEternalSoulSpecialSummon(host: DuelsService, duelId: string | number, userId: number, source: 'hand' | 'graveyard', index: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = host['activeDuels'].get(duelIdStr) || (await host['findDuelByIdFromDatabase'](duelIdStr));
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const pending = (duel as any).pendingChoice;
    if (!pending || pending.type !== 'ETERNAL_SOUL_EFFECT' || Number(pending.userId) !== Number(userId)) {
      return { success: false, message: 'Escolha inválida' };
    }
    if (!pending.data?.canSpecialSummon) {
      return { success: false, message: 'Invocação Especial indisponível' };
    }

    const isPlayer1 = Number(duel.player1Id) === Number(userId);
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const emptyZone = EternalSoul.findEmptyMonsterZone(playerField?.monsters);
    if (emptyZone < 0) return { success: false, message: 'Sem zona de monstro vazia' };

    let card: any = null;
    if (source === 'hand') {
      if (index < 0 || index >= (playerField.hand || []).length || !EternalSoul.isDarkMagician(playerField.hand[index])) {
        return { success: false, message: 'Dark Magician inválido na mão' };
      }
      card = playerField.hand.splice(index, 1)[0];
    } else {
      if (
        index < 0 ||
        index >= (playerField.graveyard || []).length ||
        !EternalSoul.isDarkMagician(playerField.graveyard[index])
      ) {
        return { success: false, message: 'Dark Magician inválido no cemitério' };
      }
      card = playerField.graveyard.splice(index, 1)[0];
    }

    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    playerField.monsters[emptyZone] = {
      ...card,
      position: 'attack',
      summonedTurnNumber: turnCounter,
      summonedByPlayer: duel.currentTurn,
      specialSummoned: true,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
    };
    EternalSoul.markEternalSoulEffectUsed(playerField, turnCounter);

    await host['clearPendingChoice'](duelIdStr, false);
    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);
    host['activeDuels'].set(duelIdStr, duel);

    // Magician's Salvation pode reagir à SS
    if (!(duel as any).pendingChoice) {
      await host['tryStartMagiciansSalvationPairEffect'](duelId, duel, isPlayer1, emptyZone);
      if ((duel as any).pendingChoice) {
        await host['updateDuelInDatabase'](duelIdStr, {
          pendingChoice: (duel as any).pendingChoice,
        } as any);
      }
    }

    await host['recalculateUnitedWeStandForBothPlayers'](duelId, duel);
    logger.info(`✨ [Eternal Soul] SS Dark Magician na zona ${emptyZone} (de ${source})`);
    return { success: true, message: 'Dark Magician invocado por Eternal Soul' };
  }
