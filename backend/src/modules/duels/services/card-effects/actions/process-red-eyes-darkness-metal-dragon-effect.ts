import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function processRedEyesDarknessMetalDragonEffect(host: DuelsService, duelId: string | number, userId: number, monsterZoneIndex: number, source: 'hand' | 'graveyard', cardIndex: number, zoneIndex: number, position: 'attack' | 'defense'): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    // Buscar duelo do banco
    let duel = await host['findDuelByIdFromDatabase'](duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    const isPlayer1 = player1IdNum === userIdNum;

    // Verificar se é o turno do jogador
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);
    if (!isCurrentTurn) {
      return { success: false, message: 'Não é seu turno' };
    }

    // Pode ser usado em qualquer fase principal
    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      return { success: false, message: 'Você só pode usar este efeito nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;


    // Verificar se o Red-Eyes Darkness Metal Dragon existe e está no campo
    if (!playerField || !playerField.monsters || !Array.isArray(playerField.monsters)) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Zona do Red-Eyes Darkness Metal Dragon inválida' };
    }

    const redEyesDragon = playerField.monsters[monsterZoneIndex];
    if (!redEyesDragon || redEyesDragon === null) {
      return { success: false, message: 'Red-Eyes Darkness Metal Dragon não encontrado no campo' };
    }

    // Verificar se é realmente Red-Eyes Darkness Metal Dragon
    if (!host['isRedEyesDarknessMetalDragon'](redEyesDragon)) {
      return { success: false, message: 'Carta no campo não é Red-Eyes Darkness Metal Dragon' };
    }

    // Verificar se o efeito já foi usado neste turno
    if (redEyesDragon.effectUsedThisTurn === true) {
      return { success: false, message: 'O efeito já foi usado neste turno' };
    }

    // Verificar se a zona de invocação é válida
    if (zoneIndex < 0 || zoneIndex >= 5) {
      return { success: false, message: 'Zona de invocação inválida' };
    }

    // Verificar se a zona está vazia
    if (playerField.monsters[zoneIndex] !== null && playerField.monsters[zoneIndex] !== undefined) {
      return { success: false, message: 'A zona de invocação já está ocupada' };
    }

    // Obter a carta da fonte especificada
    let cardToSummon: any = null;

    if (source === 'hand') {
      if (!playerField.hand || cardIndex < 0 || cardIndex >= playerField.hand.length) {
        return { success: false, message: 'Índice da mão inválido' };
      }
      cardToSummon = playerField.hand[cardIndex];

      // Verificar se é dragão e não é Red-Eyes Darkness Metal Dragon
      const race = (cardToSummon.race || cardToSummon.cardRace || '').toString().toUpperCase().trim();
      const isDragon = race === 'DRAGON' || race === 'DRAGÃO' || race.includes('DRAGON');
      const isRedEyes = host['isRedEyesDarknessMetalDragon'](cardToSummon);

      logger.info(`🔍 [processRedEyesDarknessMetalDragonEffect] Validando carta da mão: ${cardToSummon.name || cardToSummon.cardName}, isDragon: ${isDragon}, isRedEyes: ${isRedEyes}, cardId: ${cardToSummon.idCarta || cardToSummon.id || cardToSummon.cardId}`);

      if (!isDragon || isRedEyes) {
        logger.warn(`❌ [processRedEyesDarknessMetalDragonEffect] Carta inválida: não é dragão ou é Red-Eyes Darkness Metal Dragon`);
        return { success: false, message: 'A carta selecionada não é válida (não pode ser Red-Eyes Darkness Metal Dragon)' };
      }

      // Remover da mão
      playerField.hand.splice(cardIndex, 1);
    } else if (source === 'graveyard') {
      if (!playerField.graveyard || cardIndex < 0 || cardIndex >= playerField.graveyard.length) {
        return { success: false, message: 'Índice do cemitério inválido' };
      }
      cardToSummon = playerField.graveyard[cardIndex];

      // Verificar se é monstro dragão e não é Red-Eyes Darkness Metal Dragon
      const cardType = (cardToSummon.type || cardToSummon.cardType || '').toString().toUpperCase().trim();
      const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
      if (!isMonster) {
        return { success: false, message: 'A carta selecionada não é um monstro' };
      }

      const race = (cardToSummon.race || cardToSummon.cardRace || '').toString().toUpperCase().trim();
      const isDragon = race === 'DRAGON' || race === 'DRAGÃO' || race.includes('DRAGON');
      const isRedEyes = host['isRedEyesDarknessMetalDragon'](cardToSummon);

      logger.info(`🔍 [processRedEyesDarknessMetalDragonEffect] Validando carta do cemitério: ${cardToSummon.name || cardToSummon.cardName}, isDragon: ${isDragon}, isRedEyes: ${isRedEyes}, cardId: ${cardToSummon.idCarta || cardToSummon.id || cardToSummon.cardId}`);

      if (!isDragon || isRedEyes) {
        logger.warn(`❌ [processRedEyesDarknessMetalDragonEffect] Carta inválida: não é dragão ou é Red-Eyes Darkness Metal Dragon`);
        return { success: false, message: 'A carta selecionada não é válida (não pode ser Red-Eyes Darkness Metal Dragon)' };
      }

      // Remover do cemitério
      playerField.graveyard.splice(cardIndex, 1);
    } else {
      return { success: false, message: 'Fonte inválida' };
    }

    if (!cardToSummon) {
      return { success: false, message: 'Carta não encontrada' };
    }

    // Invocar o dragão - SEMPRE em ataque (efeito do Red-Eyes Darkness Metal Dragon)
    const finalPosition = 'attack';

    logger.info(`🔍 [processRedEyesDarknessMetalDragonEffect] Invocando dragão em posição: ${finalPosition} (sempre ataque)`);

    // Obter turnCounter
    const playerFieldForCounter = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const currentTurnCounter = playerFieldForCounter?.turnCounter || duel.turnCounter || 1;

    playerField.monsters[zoneIndex] = {
      ...cardToSummon,
      position: finalPosition,
      summonedTurnNumber: currentTurnCounter,
      summonedByPlayer: duel.currentTurn,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
      specialSummoned: true,
    };

    // Marcar que o efeito foi usado neste turno
    redEyesDragon.effectUsedThisTurn = true;

    logger.info(`✅ [processRedEyesDarknessMetalDragonEffect] Dragão invocado: ${cardToSummon.name || cardToSummon.cardName} de ${source}`);

    // Limpar pendingChoice e atualizar no banco
    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);

    // Atualizar cache
    host['activeDuels'].set(duelIdStr, duel);

    return { success: true };
  }
