import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';
import * as EternalSoul from '../effects/traps/eternal-soul';

/** Registered effect action; public API remains on DuelsService. */
export async function tryStartEternalSoulEffect(host: DuelsService, duelId: string | number, userId: number, spellTrapZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = host['activeDuels'].get(duelIdStr) || (await host['findDuelByIdFromDatabase'](duelIdStr));
    if (!duel) return { success: false, message: 'Duelo não encontrado' };
    if ((duel as any).pendingChoice) {
      return { success: false, message: 'Já existe uma escolha pendente' };
    }

    const isPlayer1 = Number(duel.player1Id) === Number(userId);
    const isCurrentTurn =
      (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);
    if (!isCurrentTurn) return { success: false, message: 'Não é seu turno' };
    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      return { success: false, message: 'Só pode usar na Main Phase' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const card = playerField?.spellTrap?.[spellTrapZoneIndex];
    if (!card || !EternalSoul.isEternalSoul(card)) {
      return { success: false, message: 'Eternal Soul não encontrada' };
    }
    const pos = String(card.position || '').toLowerCase();
    if (pos !== 'face-up' && pos !== 'activated') {
      return { success: false, message: 'Eternal Soul precisa estar face-up' };
    }

    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    if (!EternalSoul.canUseEternalSoulEffectThisTurn(playerField, turnCounter)) {
      return { success: false, message: 'Já usou o efeito de Eternal Soul neste turno' };
    }

    const ssOptions = EternalSoul.listDarkMagiciansInHandOrGy(playerField);
    const searchOptions = EternalSoul.listDarkMagicAttackOrKnivesInDeck(playerField?.deck);
    const canSs =
      ssOptions.length > 0 && EternalSoul.findEmptyMonsterZone(playerField?.monsters) >= 0;
    const canSearch = searchOptions.length > 0;

    if (!canSs && !canSearch) {
      return { success: false, message: 'Nenhum efeito de Eternal Soul disponível' };
    }

    const choice = {
      type: 'ETERNAL_SOUL_EFFECT' as const,
      userId: Number(userId),
      turnWhenStarted: turnCounter,
      phaseWhenStarted: duel.currentPhase,
      data: {
        spellTrapZoneIndex,
        canSpecialSummon: canSs,
        canSearch,
        specialSummonOptions: ssOptions.map((o) => ({
          source: o.source,
          index: o.index,
          name: o.card?.name || o.card?.cardName,
          idCarta: o.card?.idCarta || o.card?.id,
          cardImage: o.card?.cardImage || o.card?.imageUrl,
        })),
        searchOptions: searchOptions.map((o) => ({
          deckIndex: o.deckIndex,
          name: o.card?.name || o.card?.cardName,
          idCarta: o.card?.idCarta || o.card?.id,
          cardImage: o.card?.cardImage || o.card?.imageUrl,
        })),
      },
    };
    (duel as any).pendingChoice = choice;
    await host['setPendingChoice'](duelId, choice);
    await host['updateDuelInDatabase'](duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: choice,
    } as any);
    host['activeDuels'].set(duelIdStr, duel);
    logger.info(`✨ [Eternal Soul] efeito disponível (SS=${canSs}, search=${canSearch})`);
    return { success: true };
  }
