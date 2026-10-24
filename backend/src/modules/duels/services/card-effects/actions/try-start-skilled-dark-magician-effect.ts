import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';
import * as SkilledDm from '../effects/Monsters/skilled-dark-magician';

/** Registered effect action; public API remains on DuelsService. */
export async function tryStartSkilledDarkMagicianEffect(host: DuelsService, duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
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
    const monster = playerField?.monsters?.[monsterZoneIndex];
    if (!monster || !SkilledDm.isFaceUpSkilledDarkMagician(monster)) {
      return { success: false, message: 'Skilled Dark Magician inválido' };
    }
    if ((Number(monster.spellCounters) || 0) < 3) {
      return { success: false, message: 'Precisa de 3 Marcadores de Magia' };
    }

    const options = SkilledDm.listDarkMagiciansFromHandDeckGy(playerField);
    if (options.length === 0) {
      return { success: false, message: 'Nenhum Dark Magician na mão, Deck ou GY' };
    }

    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    const choice = {
      type: 'SKILLED_DARK_MAGICIAN' as const,
      userId: Number(userId),
      turnWhenStarted: turnCounter,
      phaseWhenStarted: duel.currentPhase,
      data: {
        tributeZoneIndex: monsterZoneIndex,
        options: options.map((o) => ({
          source: o.source,
          index: o.index,
          name: o.card?.name || o.card?.cardName,
          idCarta: o.card?.idCarta || o.card?.id,
          cardImage: o.card?.cardImage || o.card?.imageUrl,
        })),
      },
    };
    (duel as any).pendingChoice = choice;
    await host['setPendingChoice'](duelId, choice);
    await host['updateDuelInDatabase'](duelId, {
      pendingChoice: choice,
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    host['activeDuels'].set(duelIdStr, duel);
    return { success: true };
  }
