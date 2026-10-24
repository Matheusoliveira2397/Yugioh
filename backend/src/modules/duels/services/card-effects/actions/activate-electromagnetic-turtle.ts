import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function activateElectromagneticTurtle(host: DuelsService, duelId: string | number, userId: number, graveyardIndex?: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = host['activeDuels'].get(duelIdStr) || (await host['findDuelByIdFromDatabase'](duelIdStr));
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const isPlayer1 = Number(duel.player1Id) === Number(userId);
    const isMyTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);

    // Deve ser turno do oponente
    if (isMyTurn) {
      return { success: false, message: 'Electromagnetic Turtle só pode ser ativado no turno do oponente' };
    }

    // Deve estar na Battle Phase
    if (duel.currentPhase !== TurnPhase.BATTLE) {
      return { success: false, message: 'Electromagnetic Turtle só pode ser ativado durante a Battle Phase' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    // Verificar se já foi usado neste duelo
    if (playerField.electromagneticTurtleUsedThisDuel === true) {
      return { success: false, message: 'Electromagnetic Turtle já foi usado neste duelo' };
    }

    // Encontrar Electromagnetic Turtle no cemitério
    const graveyard = playerField?.graveyard || [];
    let turtleIndex = -1;

    if (graveyardIndex !== undefined && graveyardIndex !== null) {
      // Index específico fornecido
      if (graveyardIndex >= 0 && graveyardIndex < graveyard.length) {
        const card = graveyard[graveyardIndex];
        if (card && host['isElectromagneticTurtle'](card)) {
          turtleIndex = graveyardIndex;
        }
      }
    } else {
      // Buscar automaticamente
      for (let i = 0; i < graveyard.length; i++) {
        if (graveyard[i] && host['isElectromagneticTurtle'](graveyard[i])) {
          turtleIndex = i;
          break;
        }
      }
    }

    if (turtleIndex === -1) {
      return { success: false, message: 'Electromagnetic Turtle não encontrado no cemitério' };
    }

    // Remover do cemitério e banir
    const [turtle] = graveyard.splice(turtleIndex, 1);
    if (!playerField.banished) playerField.banished = [];
    playerField.banished.push(turtle);

    // Marcar como usado neste duelo
    playerField.electromagneticTurtleUsedThisDuel = true;

    // Encerrar Battle Phase indo para MAIN2
    duel.currentPhase = TurnPhase.MAIN2;

    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      currentPhase: duel.currentPhase,
    } as any);
    host['activeDuels'].set(duelIdStr, duel);

    const cardName = turtle.name || turtle.cardName || 'Electromagnetic Turtle';
    logger.info(`🐢 [Electromagnetic Turtle] ativado - Battle Phase encerrada`);
    return { success: true, message: `${cardName} ativado - Battle Phase encerrada` };
  }
