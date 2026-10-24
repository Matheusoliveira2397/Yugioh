import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';
import * as MagiciansSalvation from '../effects/spells/magicians-salvation';

/** Registered choice; public API remains on DuelsService. */
export async function processMagiciansSalvationPairChoice(host: DuelsService, duelId: string | number, userId: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = host['activeDuels'].get(duelIdStr) || (await host['findDuelByIdFromDatabase'](duelIdStr));
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const pending = (duel as any).pendingChoice;
    if (
      !pending ||
      pending.type !== 'MAGICIAN_S_SALVATION_PAIR' ||
      Number(pending.userId) !== Number(userId)
    ) {
      return { success: false, message: 'Escolha inválida' };
    }

    const isPlayer1 = Number(duel.player1Id) === Number(userId);
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!MagiciansSalvation.hasFaceUpMagiciansSalvation(playerField)) {
      await host['clearPendingChoice'](duelIdStr, false);
      return { success: false, message: "Magician's Salvation não está no campo" };
    }

    const targetZone = pending.data?.targetZoneIndex;
    const target = playerField?.monsters?.[targetZone];
    if (!target || !MagiciansSalvation.isDarkMagicianOrGirl(target)) {
      await host['clearPendingChoice'](duelIdStr, false);
      return { success: false, message: 'Monstro alvo inválido' };
    }

    let gyIndex = pending.data?.graveyardIndex;
    let pairCard = playerField.graveyard?.[gyIndex];
    if (!pairCard || !MagiciansSalvation.isDarkMagicianOrGirl(pairCard)) {
      const found = MagiciansSalvation.findPairInGraveyard(playerField.graveyard, target);
      if (!found) {
        await host['clearPendingChoice'](duelIdStr, false);
        return { success: false, message: 'Par não encontrado no cemitério' };
      }
      gyIndex = found.index;
      pairCard = found.card;
    }

    // Nomes diferentes
    if (
      (MagiciansSalvation.isDarkMagician(target) && MagiciansSalvation.isDarkMagician(pairCard)) ||
      (MagiciansSalvation.isDarkMagicianGirl(target) && MagiciansSalvation.isDarkMagicianGirl(pairCard))
    ) {
      return { success: false, message: 'O monstro do cemitério deve ter nome diferente' };
    }

    let summonZone = pending.data?.summonZoneIndex;
    if (summonZone == null || playerField.monsters?.[summonZone] != null) {
      summonZone = MagiciansSalvation.findEmptyMonsterZone(playerField.monsters);
    }
    if (summonZone < 0) {
      await host['clearPendingChoice'](duelIdStr, false);
      return { success: false, message: 'Sem zona de monstro vazia' };
    }

    const [fromGy] = playerField.graveyard.splice(gyIndex, 1);
    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    playerField.monsters[summonZone] = {
      ...fromGy,
      position: 'attack',
      summonedTurnNumber: turnCounter,
      summonedByPlayer: duel.currentTurn,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
    };
    playerField.magiciansSalvationPairUsedTurn = turnCounter;

    await host['clearPendingChoice'](duelIdStr, false);
    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);
    host['activeDuels'].set(duelIdStr, duel);
    await host['recalculateUnitedWeStandForBothPlayers'](duelId, duel);

    const name = fromGy.name || fromGy.cardName || 'monstro';
    logger.info(`✨ [Magician's Salvation] Invocou ${name} do GY na zona ${summonZone}`);
    return { success: true, message: `Invocou ${name} do cemitério` };
  }
