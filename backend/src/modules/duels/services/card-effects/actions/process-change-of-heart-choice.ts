import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered choice; public API remains on DuelsService. */
export async function processChangeOfHeartChoice(host: DuelsService, duelId: string | number, userId: number, chosenMonsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    let duel = await host['findDuelByIdFromDatabase'](duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    const isPlayer1 = player1IdNum === userIdNum;
    let playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    // Validar índice da zona
    if (chosenMonsterZoneIndex < 0 || chosenMonsterZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }

    // Verificar se há um monstro na zona escolhida do oponente
    if (!opponentField || !opponentField.monsters || !Array.isArray(opponentField.monsters)) {
      return { success: false, message: 'Campo do oponente não encontrado' };
    }

    const chosenMonster = opponentField.monsters[chosenMonsterZoneIndex];
    if (!chosenMonster || chosenMonster === null || chosenMonster === undefined) {
      return { success: false, message: 'Nenhum monstro na zona escolhida' };
    }

    // Verificar se é Mataza The Zapper face-up (não pode ser controlada)
    const monsterCardId = chosenMonster.idCarta || chosenMonster.id || chosenMonster.cardId;
    const monsterName = (chosenMonster.name || chosenMonster.cardName || '').toLowerCase();
    const isMatazaTheZapper = monsterCardId === 'MatazaTheZapper' ||
                              monsterCardId === 'matazathezapper' ||
                              monsterName === 'mataza the zapper' ||
                              monsterName === 'matazathezapper' ||
                              host['isExactCard'](chosenMonster, 'MatazaTheZapper');
    const position = chosenMonster.position || 'attack';
    const isFaceUp = position === 'attack' || position === 'defense';

    // Se for Mataza The Zapper face-up, não pode ser controlada
    if (isMatazaTheZapper && isFaceUp) {
      logger.info(`🛡️ [processChangeOfHeartChoice] Mataza The Zapper está face-up e não pode ser controlada`);
      return { success: false, message: 'Mataza The Zapper não pode ser controlada quando está face-up' };
    }

    // Pode controlar monstros em qualquer posição (attack, defense ou set)

    // Verificar se há espaço no campo do jogador
    const emptyZoneIndex = playerField.monsters.findIndex((m: any) => m === null || m === undefined);
    if (emptyZoneIndex === -1) {
      return { success: false, message: 'Não há espaço no seu campo para controlar o monstro' };
    }

    // Obter contador global de turnos
    const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;

    // Remover o monstro do campo do oponente
    opponentField.monsters[chosenMonsterZoneIndex] = null;

    // Preservar a posição do monstro: se estava face-down (set), permanece face-down no nosso campo
    // (o jogador pode virar quando quiser). Se estava face-up, mantém attack/defense.
    const originalPosition = chosenMonster.position || 'attack';
    const newPosition = originalPosition; // 'set' permanece 'set'; 'attack'/'defense' permanecem

    // Adicionar o monstro ao campo do jogador com informações de controle (até fim do turno ou ser destruído)
    const controlledMonster = {
      ...chosenMonster,
      position: newPosition,
      controlledBy: isPlayer1 ? 1 : 2, // Quem está controlando
      originalOwner: isPlayer1 ? 2 : 1, // Dono original
      originalZoneIndex: chosenMonsterZoneIndex, // Zona original no campo do oponente
      controlledUntilTurn: currentTurnCounter, // Será devolvido no final deste turno
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
    };

    playerField.monsters[emptyZoneIndex] = controlledMonster;

    logger.info(`✅ [processChangeOfHeartChoice] Monstro ${chosenMonster.name || chosenMonster.cardName} agora está sob controle do jogador ${isPlayer1 ? 1 : 2} (posição: ${newPosition})`);
    logger.info(`🔍 [processChangeOfHeartChoice] Detalhes do controle:`);
    logger.info(`   - controlledBy: ${controlledMonster.controlledBy}`);
    logger.info(`   - originalOwner: ${controlledMonster.originalOwner}`);
    logger.info(`   - originalZoneIndex: ${controlledMonster.originalZoneIndex}`);
    logger.info(`   - controlledUntilTurn: ${controlledMonster.controlledUntilTurn}`);
    logger.info(`   - currentTurnCounter: ${currentTurnCounter}`);

    // Colocar Change Of Heart no campo (se estava na mão) ou virar para face-up (se estava em "set")
    // Assim advanceToNextTurn poderá movê-la para o cemitério no fim do turno
    const pendingChoice = (duel as any).pendingChoice;
    if (pendingChoice && pendingChoice.data) {
      const cardWasOnField = pendingChoice.data.cardWasOnField;
      const cardData = pendingChoice.data.cardData;
      const cardIdFromPending = pendingChoice.data.cardId;
      let targetZoneIndex = pendingChoice.data.zoneIndex;

      if (cardData && cardIdFromPending) {
        if (!cardWasOnField) {
          // Carta estava na mão: remover da mão e colocar no campo em uma zona vazia
          const handIndex = playerField.hand.findIndex((c: any) => {
            if (pendingChoice.data.cardInstanceId && c.instanceId) {
              return c.instanceId === pendingChoice.data.cardInstanceId;
            }
            const cId = c.idCarta || c.id || c.cardId;
            return cId === cardIdFromPending;
          });
          if (handIndex !== -1) {
            playerField.hand.splice(handIndex, 1);
            logger.info(`✅ [processChangeOfHeartChoice] Change Of Heart removida da mão`);
          }
          if (!playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
            playerField.spellTrap = [null, null, null, null, null];
          }
          while (playerField.spellTrap.length < 5) {
            playerField.spellTrap.push(null);
          }
          playerField.spellTrap = playerField.spellTrap.slice(0, 5);
          if (targetZoneIndex == null || targetZoneIndex < 0 || targetZoneIndex >= 5) {
            targetZoneIndex = playerField.spellTrap.findIndex((s: any) => s === null || s === undefined);
          }
          if (targetZoneIndex >= 0 && targetZoneIndex < 5) {
            playerField.spellTrap[targetZoneIndex] = { ...cardData, position: 'face-up' };
            logger.info(`✅ [processChangeOfHeartChoice] Change Of Heart colocada no campo na zona ${targetZoneIndex} (face-up até fim do turno)`);
          }
        } else if (targetZoneIndex !== undefined && targetZoneIndex !== null && targetZoneIndex >= 0 && targetZoneIndex < 5) {
          if (playerField.spellTrap && playerField.spellTrap[targetZoneIndex]) {
            playerField.spellTrap[targetZoneIndex].position = 'face-up';
            logger.info(`✅ [processChangeOfHeartChoice] Change Of Heart virada para face-up na zona ${targetZoneIndex}`);
          }
        }
      }
    }
    await host['clearPendingChoice'](duelId);

    // Atualizar no banco
    await host['updateDuelInDatabase'](duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    host['activeDuels'].set(duelIdStr, duel);

    return { success: true };
  }
