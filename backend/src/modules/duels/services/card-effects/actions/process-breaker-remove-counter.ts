import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function processBreakerRemoveCounter(host: DuelsService, duelId: string | number, userId: number, monsterZoneIndex: number, targetPlayer: 'player' | 'opponent', targetZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    let duel = await host['findDuelByIdFromDatabase'](duelIdStr, true);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);

    const isPlayer1 = player1IdNum === userIdNum;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    // Validar índices
    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5 || targetZoneIndex < 0 || targetZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }

    // Verificar se o Breaker existe na zona especificada
    if (!playerField.monsters || !playerField.monsters[monsterZoneIndex]) {
      return { success: false, message: 'Monstro não encontrado na zona especificada' };
    }

    const breaker = playerField.monsters[monsterZoneIndex];
    const isBreaker = host['isExactCard'](breaker, 'BreakerTheMagicalWarrior');

    if (!isBreaker) {
      return { success: false, message: 'Esta carta não é Breaker The Magical Warrior' };
    }

    // Verificar se tem marcador de magia
    if (!breaker.spellCounters || breaker.spellCounters <= 0) {
      return { success: false, message: 'Breaker não tem marcadores de magia para remover' };
    }

    // Remover 1 marcador
    breaker.spellCounters = Math.max(0, breaker.spellCounters - 1);

    // Recalcular ATK
    const spellCounters = breaker.spellCounters || 0;
    const atkBonus = spellCounters * 300;
    breaker.spellCounterBonusAtk = atkBonus;

    logger.info(`✨ [processBreakerRemoveCounter] Breaker: Marcador removido. Marcadores restantes: ${spellCounters}, ATK bonus: +${atkBonus}`);

    // Determinar qual campo tem o alvo
    const targetField = targetPlayer === 'player' ? playerField : (isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field);
    const targetIsPlayer1 = targetPlayer === 'player' ? isPlayer1 : !isPlayer1;

    // Verificar se há spell/trap na zona alvo
    if (!targetField.spellTrap || !targetField.spellTrap[targetZoneIndex]) {
      return { success: false, message: 'Não há spell/trap na zona selecionada' };
    }

    const targetCard = targetField.spellTrap[targetZoneIndex];
    const targetCardId = targetCard.idCarta || targetCard.id || targetCard.cardId;

    logger.info(`✨ [processBreakerRemoveCounter] Destruindo spell/trap: ${targetCard.name || targetCard.cardName || 'Desconhecida'}`);

    // Verificar se é ChangeOfHeart, BrainControl, UnitedWeStand ou MagePower - processar efeitos especiais
    if (host['isExactCard'](targetCard, 'ChangeOfHeart')) {
      logger.info(`💥 [processBreakerRemoveCounter] ChangeOfHeart destruída - devolvendo monstros controlados`);
      await host['returnChangeOfHeartMonsters'](duelIdStr, duel, targetIsPlayer1);
    } else if (host['isExactCard'](targetCard, 'BrainControl')) {
      logger.info(`💥 [processBreakerRemoveCounter] BrainControl destruída - devolvendo monstros controlados`);
      await host['returnChangeOfHeartMonsters'](duelIdStr, duel, targetIsPlayer1);
    } else if (host['isExactCard'](targetCard, 'UnitedWeStand')) {
      logger.info(`💥 [processBreakerRemoveCounter] UnitedWeStand destruída - removendo equipamento`);
      await host['handleEquipmentDestruction'](duelIdStr, duel, targetIsPlayer1, undefined, targetCard, targetZoneIndex);
    } else if (host['isExactCard'](targetCard, 'MagePower')) {
      logger.info(`💥 [processBreakerRemoveCounter] MagePower destruída - removendo equipamento`);
      await host['handleEquipmentDestruction'](duelIdStr, duel, targetIsPlayer1, undefined, targetCard, targetZoneIndex);
    } else {
      // Se outra spell/trap foi destruída, recalcular ATK do MagePower ANTES de remover
      await host['recalculateMagePowerAtk'](duelIdStr, duel, targetIsPlayer1);
    }

    // Remover do campo
    targetField.spellTrap[targetZoneIndex] = null;

    // Mover para o cemitério
    if (!targetField.graveyard) targetField.graveyard = [];
    targetField.graveyard.push(targetCard);

    // Recalcular ATK do Breaker após remover marcador
    await host['recalculateBreakerAtk'](duelIdStr, duel, isPlayer1);

    // Snapshot dos campos para garantir que graveyard e spellTrap sejam persistidos corretamente
    const player1FieldToSave = JSON.parse(JSON.stringify((duel as any).player1Field));
    const player2FieldToSave = JSON.parse(JSON.stringify((duel as any).player2Field));
    logger.info(`✅ [processBreakerRemoveCounter] Salvando - P1 graveyard: ${player1FieldToSave.graveyard?.length ?? 0}, P2 graveyard: ${player2FieldToSave.graveyard?.length ?? 0}`);

    // Atualizar no banco
    await host['updateDuelInDatabase'](duelId, {
      player1Field: player1FieldToSave,
      player2Field: player2FieldToSave,
    } as any);

    // Atualizar cache com o mesmo estado salvo
    (duel as any).player1Field = player1FieldToSave;
    (duel as any).player2Field = player2FieldToSave;
    host['activeDuels'].set(duelIdStr, duel);

    logger.info(`✅ [processBreakerRemoveCounter] Spell/Trap destruída com sucesso!`);
    return { success: true };
  }
