import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/** Trap activation — mirror-force (effects/traps) */
export async function checkAndActivateMirrorForce(host: any, duelId: string | number, duel: Duel, isPlayer1: boolean): Promise<boolean> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    // Verificar se Jinzo está no campo - se estiver, traps não podem ser ativadas
    if (host.isJinzoOnField(duel)) {
      logger.info(`🤖 [checkAndActivateMirrorForce] Jinzo está no campo - Mirror Force não pode ser ativada`);
      return false;
    }
    
    // Verificar se MirageDragon está no campo do oponente durante a Fase de Batalha
    // isPlayer1 = jogador que está atacando (atacante)
    // O oponente (defensor) está tentando ativar a trap, então passamos !isPlayer1
    if (host.isMirageDragonBlockingTraps(duel, !isPlayer1)) {
      logger.info(`🐉 [checkAndActivateMirrorForce] MirageDragon está no campo do atacante - Mirror Force não pode ser ativada durante Fase de Batalha`);
      return false;
    }
    
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!opponentField || !opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
      return false;
    }

    // Verificar se o oponente tem Mirror Force setada (face-down)
    let mirrorForceZoneIndex = -1;
    for (let i = 0; i < opponentField.spellTrap.length; i++) {
      const trap = opponentField.spellTrap[i];
      if (trap && trap !== null) {
        const trapId = trap.idCarta || trap.id || trap.cardId;
        const trapName = (trap.name || trap.cardName || '').toLowerCase();
        const trapPosition = trap.position || 'set';
        
        const isMirrorForce = host.isExactCard(trap, 'MirrorForce');
        
        // Mirror Force deve estar setada (face-down)
        if (isMirrorForce && trapPosition === 'set') {
          mirrorForceZoneIndex = i;
          logger.info(`🪞 [checkAndActivateMirrorForce] Mirror Force encontrada na zona ${i} do oponente`);
          break;
        }
      }
    }

    if (mirrorForceZoneIndex === -1) {
      return false; // Não há Mirror Force setada
    }

    logger.info(`💥 [checkAndActivateMirrorForce] Mirror Force ativada! Destruindo todos os monstros do atacante em modo de ataque`);

    // Destruir todos os monstros do atacante que estão em modo de ataque
    if (!attackerField || !attackerField.monsters || !Array.isArray(attackerField.monsters)) {
      return false;
    }

    let destroyedCount = 0;
    const monstersToDestroy: any[] = [];

    // Coletar todos os monstros em modo de ataque
    for (let i = 0; i < attackerField.monsters.length; i++) {
      const monster = attackerField.monsters[i];
      if (monster && monster !== null && monster.position === 'attack') {
        monstersToDestroy.push({ monster, zoneIndex: i });
      }
    }

    // Destruir os monstros coletados IMEDIATAMENTE — cada um vai para o cemitério do DONO ORIGINAL
    for (const { monster, zoneIndex } of monstersToDestroy) {
      // Verificar se o monstro tinha equipamento antes de destruir
      await host.handleEquipmentDestruction(duelId, duel, isPlayer1, monster);
      
      const ownerFieldMF = host.getOwnerFieldForMonster(duel, monster, isPlayer1);
      if (!ownerFieldMF.graveyard) ownerFieldMF.graveyard = [];
      ownerFieldMF.graveyard.push(monster);
      attackerField.monsters[zoneIndex] = null;
      destroyedCount++;
      
      // Marcar que um monstro foi destruído no campo do atacante neste turno (para Last Will)
      if (!attackerField.monsterDestroyedThisTurn) {
        attackerField.monsterDestroyedThisTurn = true;
        logger.info(`✅ [checkAndActivateMirrorForce] Monstro destruído no campo do atacante - Last Will pode ser ativada`);
      }
      
      logger.info(`💥 [checkAndActivateMirrorForce] ${monster.name || monster.cardName} destruído IMEDIATAMENTE e enviado para o cemitério`);
    }

    // Mover Mirror Force para o cemitério do oponente IMEDIATAMENTE após destruir monstros
    const mirrorForce = opponentField.spellTrap[mirrorForceZoneIndex];
    if (mirrorForce) {
      if (!opponentField.graveyard) {
        opponentField.graveyard = [];
      }
      opponentField.graveyard.push(mirrorForce);
      opponentField.spellTrap[mirrorForceZoneIndex] = null;
      logger.info(`✅ [checkAndActivateMirrorForce] Mirror Force movida para o cemitério do oponente IMEDIATAMENTE após ativação`);
    }

    // Atualizar no banco IMEDIATAMENTE após destruir monstros e mover Mirror Force
    await host.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache IMEDIATAMENTE
    host.activeDuels.set(duelIdStr, duel);

    // Recalcular UnitedWeStand e MagePower para ambos os jogadores se monstros foram destruídos (após atualizar banco)
    if (destroyedCount > 0) {
      await host.recalculateUnitedWeStandForBothPlayers(duelId, duel);
      // Atualizar novamente no banco após recalcular UnitedWeStand
      await host.updateDuelInDatabase(duelId, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      } as any);
      host.activeDuels.set(duelIdStr, duel);
    } else {
      // Mirror Force foi removida do campo mesmo sem destruir monstros → Mage Power do oponente deve ser recalculado
      await host.recalculateMagePowerAtk(duelId, duel, !isPlayer1);
      await host.updateDuelInDatabase(duelId, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      } as any);
      host.activeDuels.set(duelIdStr, duel);
    }

    if (destroyedCount === 0) {
      logger.info(`ℹ️ [checkAndActivateMirrorForce] Mirror Force ativada, mas não havia monstros em modo de ataque para destruir`);
    } else {
      logger.info(`✅ [checkAndActivateMirrorForce] Mirror Force destruiu ${destroyedCount} monstro(s) em modo de ataque e atualizou no banco IMEDIATAMENTE`);
    }

    return true; // Mirror Force foi ativada
  }
