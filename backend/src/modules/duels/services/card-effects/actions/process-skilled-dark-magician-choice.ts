import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';
import * as SkilledDm from '../effects/Monsters/skilled-dark-magician';

/** Registered choice; public API remains on DuelsService. */
export async function processSkilledDarkMagicianChoice(host: DuelsService, duelId: string | number, userId: number, source: 'hand' | 'deck' | 'graveyard', index: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = host['activeDuels'].get(duelIdStr) || (await host['findDuelByIdFromDatabase'](duelIdStr));
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const pending = (duel as any).pendingChoice;
    if (
      !pending ||
      pending.type !== 'SKILLED_DARK_MAGICIAN' ||
      Number(pending.userId) !== Number(userId)
    ) {
      return { success: false, message: 'Escolha inválida' };
    }

    const isPlayer1 = Number(duel.player1Id) === Number(userId);
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const tributeZone = pending.data?.tributeZoneIndex;
    const tribute = playerField?.monsters?.[tributeZone];
    if (!tribute || !SkilledDm.isSkilledDarkMagician(tribute)) {
      await host['clearPendingChoice'](duelIdStr, false);
      return { success: false, message: 'Skilled Dark Magician não está no campo' };
    }
    if ((Number(tribute.spellCounters) || 0) < 3) {
      return { success: false, message: 'Precisa de 3 Marcadores de Magia' };
    }

    let card: any = null;
    if (source === 'hand') {
      if (!SkilledDm.isDarkMagician(playerField.hand?.[index])) {
        return { success: false, message: 'Dark Magician inválido na mão' };
      }
      card = playerField.hand.splice(index, 1)[0];
    } else if (source === 'deck') {
      if (!SkilledDm.isDarkMagician(playerField.deck?.[index])) {
        return { success: false, message: 'Dark Magician inválido no deck' };
      }
      card = playerField.deck.splice(index, 1)[0];
      const deck = playerField.deck || [];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      playerField.deck = deck;
    } else {
      if (!SkilledDm.isDarkMagician(playerField.graveyard?.[index])) {
        return { success: false, message: 'Dark Magician inválido no cemitério' };
      }
      card = playerField.graveyard.splice(index, 1)[0];
    }

    // Tributar Skilled DM
    await host['handleEquipmentDestruction'](duelId, duel, isPlayer1, tribute);
    playerField.monsters[tributeZone] = null;
    host['sendMonsterLeavingField'](duel, tribute, isPlayer1);

    // Invocar DM na mesma zona se vazia, senão primeira vazia
    let summonZone = tributeZone;
    if (playerField.monsters[summonZone] != null) {
      summonZone = SkilledDm.findEmptyMonsterZone(playerField.monsters);
    }
    if (summonZone < 0) {
      // Devolver carta à origem se sem zona (raro após tributo)
      if (source === 'hand') playerField.hand.push(card);
      else if (source === 'deck') playerField.deck.push(card);
      else playerField.graveyard.push(card);
      await host['clearPendingChoice'](duelIdStr, false);
      return { success: false, message: 'Sem zona de monstro vazia' };
    }

    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    playerField.monsters[summonZone] = {
      ...card,
      position: 'attack',
      summonedTurnNumber: turnCounter,
      summonedByPlayer: duel.currentTurn,
      specialSummoned: true,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
    };

    await host['clearPendingChoice'](duelIdStr, false);
    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);
    host['activeDuels'].set(duelIdStr, duel);

    if (!(duel as any).pendingChoice) {
      await host['tryStartMagiciansSalvationPairEffect'](duelId, duel, isPlayer1, summonZone);
      if ((duel as any).pendingChoice) {
        await host['updateDuelInDatabase'](duelIdStr, {
          pendingChoice: (duel as any).pendingChoice,
        } as any);
      }
    }

    await host['recalculateUnitedWeStandForBothPlayers'](duelId, duel);
    logger.info(`✨ [Skilled Dark Magician] Tributado → SS Dark Magician zona ${summonZone}`);
    return { success: true, message: 'Dark Magician invocado por Skilled Dark Magician' };
  }
