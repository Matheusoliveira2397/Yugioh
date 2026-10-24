import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered choice; public API remains on DuelsService. */
export async function processSnowmanEaterChoice(host: DuelsService, duelId: string | number, userId: number, targetPlayer: 'player' | 'opponent', targetZoneIndex: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
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

    // Verificar se o índice do SnowmanEater é válido
    if (monsterZoneIndex === undefined || monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Zona do SnowmanEater inválida' };
    }

    // Obter campo do alvo
    const targetField = targetPlayer === 'player'
      ? (isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field)
      : (isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field);

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

    // Verificar se o monstro está face-up (attack ou defense)
    if (targetMonster.position !== 'attack' && targetMonster.position !== 'defense') {
      return { success: false, message: 'O monstro alvo deve estar face-up (ataque ou defesa)' };
    }

    // Obter dados do SnowmanEater usando o monsterZoneIndex passado como parâmetro
    const snowmanEaterZoneIndex = monsterZoneIndex;

    const snowmanEaterField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const snowmanEater = snowmanEaterField?.monsters?.[snowmanEaterZoneIndex];

    if (!snowmanEater) {
      return { success: false, message: 'SnowmanEater não encontrado no campo' };
    }

    const snowmanEaterId = snowmanEater.idCarta || snowmanEater.id || snowmanEater.cardId;
    const snowmanEaterName = (snowmanEater.name || snowmanEater.cardName || '').toLowerCase();
    const isSnowmanEater = host['isExactCard'](snowmanEater, 'SnowmanEater');

    if (!isSnowmanEater) {
      return { success: false, message: 'Carta no campo não é SnowmanEater' };
    }

    logger.info(`✨ [processSnowmanEaterChoice] Destruindo monstro: ${targetMonster.name || targetMonster.cardName || 'Desconhecido'}`);

    // Verificar se o monstro tinha equipamento antes de destruir
    await host['handleEquipmentDestruction'](duelId, duel, targetPlayer === 'player' ? isPlayer1 : !isPlayer1, targetMonster);

    // Mover monstro alvo para o cemitério do DONO ORIGINAL
    const controllerIsP1 = targetPlayer === 'player' ? isPlayer1 : !isPlayer1;
    const ownerFieldSnow = host['getOwnerFieldForMonster'](duel, targetMonster, controllerIsP1);
    targetField.monsters[targetZoneIndex] = null;
    if (!ownerFieldSnow.graveyard) ownerFieldSnow.graveyard = [];
    ownerFieldSnow.graveyard.push(targetMonster);

    logger.info(`✅ [processSnowmanEaterChoice] Monstro destruído com sucesso!`);

    // Salvar no banco (não há pendingChoice para limpar)
    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    host['activeDuels'].set(duelIdStr, duel);

    return { success: true };
  }
