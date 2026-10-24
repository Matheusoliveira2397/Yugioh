import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function processBlackLusterSoldierEffect(host: DuelsService, duelId: string | number, userId: number, monsterZoneIndex: number, effectNumber: 1 | 2, targetPlayer?: 'player' | 'opponent', targetZoneIndex?: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = await host['findDuelByIdFromDatabase'](duelIdStr);
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    const isPlayer1 = player1IdNum === userIdNum;
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);
    if (!isCurrentTurn) return { success: false, message: 'Não é seu turno' };

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    if (!playerField?.monsters || monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Campo ou zona inválida' };
    }

    const bls = playerField.monsters[monsterZoneIndex];
    if (!bls) return { success: false, message: 'Black Luster Soldier não encontrado no campo' };

    const isBLS = host['isExactCard'](bls, 'BlackLusterSoldierEnvoyOfTheBeginning') ||
      (typeof (bls.name || bls.cardName || '') === 'string' && (bls.name || bls.cardName).toLowerCase().includes('black luster soldier'));
    if (!isBLS) return { success: false, message: 'Carta no campo não é Black Luster Soldier - Envoy of the Beginning' };

    if (bls.effectUsedThisTurn === true) {
      return { success: false, message: 'O efeito do Black Luster Soldier já foi usado neste turno' };
    }

    bls.effectUsedThisTurn = true;

    if (effectNumber === 1) {
      if (targetPlayer === undefined || targetZoneIndex === undefined) {
        return { success: false, message: 'Alvo inválido para o efeito 1' };
      }
      const targetField = targetPlayer === 'player' ? playerField : opponentField;
      if (!targetField?.monsters || targetZoneIndex < 0 || targetZoneIndex >= 5) {
        return { success: false, message: 'Zona do alvo inválida' };
      }
      const targetMonster = targetField.monsters[targetZoneIndex];
      if (!targetMonster || (targetMonster.position !== 'attack' && targetMonster.position !== 'defense')) {
        return { success: false, message: 'Monstro alvo deve estar face-up' };
      }
      await host['handleEquipmentDestruction'](duelId, duel, targetPlayer === 'player' ? isPlayer1 : !isPlayer1, targetMonster);
      targetField.monsters[targetZoneIndex] = null;
      const ownerFieldBLS = host['getOwnerFieldForMonster'](duel, targetMonster, targetPlayer === 'player' ? isPlayer1 : !isPlayer1);
      if (!ownerFieldBLS.banished) ownerFieldBLS.banished = [];
      ownerFieldBLS.banished.push(targetMonster);
      bls.cannotAttackThisTurn = true;
      logger.info(`✅ [processBlackLusterSoldierEffect] Efeito 1: monstro banido. BLS não pode atacar este turno.`);
    } else {
      bls.canAttackAgainIfDestroys = true;
      logger.info(`✅ [processBlackLusterSoldierEffect] Efeito 2: BLS pode atacar novamente se destruir um monstro em batalha.`);
    }

    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    host['activeDuels'].set(duelIdStr, duel);
    return { success: true };
  }
