import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/** Trap activation — dimensional-prison (effects/traps) */
export async function checkAndActivateDimensionalPrison(host: any, duelId: string | number, duel: Duel, isPlayer1: boolean, attackerZoneIndex: number): Promise<boolean> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    // Verificar se Jinzo está no campo - se estiver, traps não podem ser ativadas
    if (host.isJinzoOnField(duel)) {
      logger.info(`🤖 [checkAndActivateDimensionalPrison] Jinzo está no campo - Dimensional Prison não pode ser ativada`);
      return false;
    }
    
    // Verificar se MirageDragon está no campo do oponente durante a Fase de Batalha
    if (host.isMirageDragonBlockingTraps(duel, !isPlayer1)) {
      logger.info(`🐉 [checkAndActivateDimensionalPrison] MirageDragon está no campo do atacante - Dimensional Prison não pode ser ativada durante Fase de Batalha`);
      return false;
    }
    
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!opponentField || !opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
      return false;
    }

    // Verificar se o oponente tem Dimensional Prison setada (face-down)
    let dimensionalPrisonZoneIndex = -1;
    for (let i = 0; i < opponentField.spellTrap.length; i++) {
      const trap = opponentField.spellTrap[i];
      if (trap && trap !== null) {
        const trapId = trap.idCarta || trap.id || trap.cardId;
        const trapPosition = trap.position || 'set';
        
        const isDimensionalPrison = host.isExactCard(trap, 'DimensionalPrison');
        
        // Dimensional Prison deve estar setada (face-down)
        if (isDimensionalPrison && trapPosition === 'set') {
          dimensionalPrisonZoneIndex = i;
          logger.info(`🚪 [checkAndActivateDimensionalPrison] Dimensional Prison encontrada na zona ${i} do oponente`);
          break;
        }
      }
    }

    if (dimensionalPrisonZoneIndex === -1) {
      return false; // Não há Dimensional Prison setada
    }

    // Verificar se o atacante ainda existe
    const attacker = attackerField?.monsters?.[attackerZoneIndex];
    if (!attacker || attacker === null) {
      return false; // Monstro atacante não existe mais
    }

    logger.info(`💥 [checkAndActivateDimensionalPrison] Dimensional Prison ativada! Banindo ${attacker.name || attacker.cardName} do jogo`);

    // Verificar se o monstro tinha equipamento antes de banir
    await host.handleEquipmentDestruction(duelId, duel, isPlayer1, attacker);
    
    // Banir o monstro atacante na zona de banidos do DONO ORIGINAL
    const ownerFieldDP = host.getOwnerFieldForMonster(duel, attacker, isPlayer1);
    if (!ownerFieldDP.banished) ownerFieldDP.banished = [];
    ownerFieldDP.banished.push(attacker);
    attackerField.monsters[attackerZoneIndex] = null;
    logger.info(`💥 [checkAndActivateDimensionalPrison] ${attacker.name || attacker.cardName} foi banido do jogo`);

    // Recalcular UnitedWeStand para ambos os jogadores se monstro foi banido
    await host.recalculateUnitedWeStandForBothPlayers(duelId, duel);

    // Mover Dimensional Prison para o cemitério do oponente
    const dimensionalPrison = opponentField.spellTrap[dimensionalPrisonZoneIndex];
    if (dimensionalPrison) {
      if (!opponentField.graveyard) {
        opponentField.graveyard = [];
      }
      opponentField.graveyard.push(dimensionalPrison);
      opponentField.spellTrap[dimensionalPrisonZoneIndex] = null;
      logger.info(`✅ [checkAndActivateDimensionalPrison] Dimensional Prison movida para o cemitério do oponente após ativação`);
      // Mage Power: recalculando ATK do oponente (uma spell/trap foi removida do campo dele)
      await host.recalculateMagePowerAtk(duelId, duel, !isPlayer1);
    }

    // Atualizar no banco IMEDIATAMENTE
    await host.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache IMEDIATAMENTE
    host.activeDuels.set(duelIdStr, duel);

    logger.info(`✅ [checkAndActivateDimensionalPrison] Dimensional Prison baniu o monstro atacante e atualizou no banco IMEDIATAMENTE`);

    return true; // Dimensional Prison foi ativada
  }
