import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered choice; public API remains on DuelsService. */
export async function processExiledForceChoice(host: DuelsService, duelId: string | number, userId: number, monsterZoneIndex: number, targetPlayer: 'player' | 'opponent', targetZoneIndex: number): Promise<{ success: boolean; message?: string }> {
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
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    // Verificar se o Exiled Force existe e está no campo
    if (!playerField || !playerField.monsters || !Array.isArray(playerField.monsters)) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Zona do Exiled Force inválida' };
    }

    const exiledForce = playerField.monsters[monsterZoneIndex];
    if (!exiledForce || exiledForce === null) {
      return { success: false, message: 'Exiled Force não encontrado no campo' };
    }

    // Verificar se é realmente Exiled Force
    const cardId = exiledForce.idCarta || exiledForce.id || exiledForce.cardId;
    const cardName = (exiledForce.name || exiledForce.cardName || '').toLowerCase();
    const isExiledForce = cardId === 'ExiledForce' ||
                         cardId === 'exiledforce' ||
                         cardId === 'Exiled-Force' ||
                         cardName === 'exiled force' ||
                         cardName === 'exiled-force' ||
                         (typeof cardId === 'string' && cardId.toLowerCase().includes('exiledforce')) ||
                         (typeof cardName === 'string' && cardName.includes('exiled force'));

    if (!isExiledForce) {
      return { success: false, message: 'Carta no campo não é Exiled Force' };
    }

    // Verificar se o efeito já foi usado neste turno
    if (exiledForce.effectUsedThisTurn === true) {
      return { success: false, message: 'O efeito do Exiled Force já foi usado neste turno' };
    }

    // Obter campo do alvo
    const targetField = targetPlayer === 'player'
      ? playerField
      : opponentField;

    if (!targetField || !targetField.monsters || !Array.isArray(targetField.monsters)) {
      return { success: false, message: 'Campo do alvo não encontrado' };
    }

    // Verificar se o índice é válido
    if (targetZoneIndex < 0 || targetZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }

    const targetMonster = targetField.monsters[targetZoneIndex];
    if (!targetMonster || targetMonster === null) {
      return { success: false, message: 'Não há monstro na zona especificada' };
    }

    // Tributar Exiled Force — vai para o cemitério do DONO ORIGINAL
    const ownerFieldExiled = host['getOwnerFieldForMonster'](duel, exiledForce, isPlayer1);
    if (!ownerFieldExiled.graveyard) ownerFieldExiled.graveyard = [];
    ownerFieldExiled.graveyard.push(exiledForce);
    playerField.monsters[monsterZoneIndex] = null;

    // Marcar que um monstro foi destruído no campo do jogador neste turno (para Last Will)
    if (!playerField.monsterDestroyedThisTurn) {
      playerField.monsterDestroyedThisTurn = true;
      logger.info(`✅ [processExiledForceChoice] Exiled Force tributado no campo do jogador - Last Will pode ser ativada`);
    }

    logger.info(`✨ [processExiledForceChoice] Exiled Force tributado e enviado para o cemitério`);

    // Verificar se o monstro alvo tinha equipamento ANTES de remover do campo
    await host['handleEquipmentDestruction'](duelId, duel, targetPlayer === 'player' ? isPlayer1 : !isPlayer1, targetMonster);

    // Destruir o monstro alvo — cemitério do DONO ORIGINAL
    const controllerIsP1Ex = targetPlayer === 'player' ? isPlayer1 : !isPlayer1;
    const ownerFieldExTarget = host['getOwnerFieldForMonster'](duel, targetMonster, controllerIsP1Ex);
    if (!ownerFieldExTarget.graveyard) ownerFieldExTarget.graveyard = [];
    ownerFieldExTarget.graveyard.push(targetMonster);
    targetField.monsters[targetZoneIndex] = null;

    if (!targetField.monsterDestroyedThisTurn) {
      targetField.monsterDestroyedThisTurn = true;
      logger.info(`✅ [processExiledForceChoice] Monstro destruído no campo do alvo (${targetPlayer}) - Last Will pode ser ativada`);
    }

    logger.info(`✅ [processExiledForceChoice] Monstro ${targetMonster.name || targetMonster.cardName} destruído e enviado para o cemitério`);

    // Atualizar no banco
    await host['updateDuelInDatabase'](duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    host['activeDuels'].set(duelIdStr, duel);

    logger.info(`✅ [processExiledForceChoice] Efeito do Exiled Force processado com sucesso`);

    return { success: true };
  }
