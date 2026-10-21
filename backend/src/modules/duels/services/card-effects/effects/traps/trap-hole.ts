import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/** Trap activation — trap-hole (effects/traps) */
export async function checkAndActivateTrapHole(host: any, duelId: string | number, duel: Duel, isPlayer1: boolean, monsterZoneIndex: number, monster: any): Promise<boolean> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    if (host.isObeliskTheTormentor(monster)) {
      logger.info(`🔒 [checkAndActivateTrapHole] Obelisk the Tormentor - invocação não pode ser negada`);
      return false;
    }
    // Verificar se Jinzo está no campo - se estiver, traps não podem ser ativadas
    if (host.isJinzoOnField(duel)) {
      logger.info(`🤖 [checkAndActivateTrapHole] Jinzo está no campo - Trap Hole não pode ser ativada`);
      return false;
    }
    
    // Verificar se MirageDragon está no campo do oponente durante a Fase de Batalha
    // isPlayer1 = jogador que invocou o monstro (atacante)
    // O oponente (defensor) está tentando ativar a trap, então passamos !isPlayer1
    if (host.isMirageDragonBlockingTraps(duel, !isPlayer1)) {
      logger.info(`🐉 [checkAndActivateTrapHole] MirageDragon está no campo do atacante - Trap Hole não pode ser ativada durante Fase de Batalha`);
      return false;
    }
    
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!opponentField || !opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
      return false;
    }

    // Verificar se o oponente tem Trap Hole setada (face-down) — isExactCard usa nome/id exato
    let trapHoleZoneIndex = -1;
    for (let i = 0; i < opponentField.spellTrap.length; i++) {
      const trap = opponentField.spellTrap[i];
      if (trap && trap !== null) {
        const trapPosition = trap.position || 'set';
        const isTrapHole = host.isExactCard(trap, 'TrapHole');
        if (isTrapHole && trapPosition === 'set') {
          trapHoleZoneIndex = i;
          logger.info(`🕳️ [checkAndActivateTrapHole] Trap Hole encontrada na zona ${i} do oponente`);
          break;
        }
      }
    }

    if (trapHoleZoneIndex === -1) {
      return false; // Não há Trap Hole setada
    }

    // Verificar se o monstro tem 1000+ de ataque
    const monsterAtk = monster.atk || 0;
    if (monsterAtk < 1000) {
      logger.info(`ℹ️ [checkAndActivateTrapHole] Monstro ${monster.name} tem apenas ${monsterAtk} de ATK, Trap Hole não ativa`);
      return false;
    }

    logger.info(`💥 [checkAndActivateTrapHole] Trap Hole ativada! Destruindo ${monster.name} (ATK: ${monsterAtk})`);

    // Verificar se o monstro tinha equipamento antes de destruir
    await host.handleEquipmentDestruction(duelId, duel, isPlayer1, monster);

    // Destruir o monstro — vai para o cemitério do DONO ORIGINAL
    const ownerFieldTH = host.getOwnerFieldForMonster(duel, monster, isPlayer1);
    if (!ownerFieldTH.graveyard) ownerFieldTH.graveyard = [];
    ownerFieldTH.graveyard.push(monster);
    playerField.monsters[monsterZoneIndex] = null;
    
    // Marcar que um monstro foi destruído no campo do jogador neste turno (para Last Will)
    if (!playerField.monsterDestroyedThisTurn) {
      playerField.monsterDestroyedThisTurn = true;
      logger.info(`✅ [checkAndActivateTrapHole] Monstro destruído no campo do jogador - Last Will pode ser ativada`);
    }

    // Recalcular UnitedWeStand para ambos os jogadores (monstro foi removido)
    await host.recalculateUnitedWeStandForBothPlayers(duelId, duel);

    // Mover Trap Hole para o cemitério do oponente
    const trapHole = opponentField.spellTrap[trapHoleZoneIndex];
    if (trapHole) {
      if (!opponentField.graveyard) {
        opponentField.graveyard = [];
      }
      opponentField.graveyard.push(trapHole);
      opponentField.spellTrap[trapHoleZoneIndex] = null;
      logger.info(`✅ [checkAndActivateTrapHole] Trap Hole movida para o cemitério do oponente após ativação`);
      // Mage Power: recalculando ATK do oponente (uma spell/trap foi removida do campo dele)
      await host.recalculateMagePowerAtk(duelId, duel, !isPlayer1);
    }

    // Atualizar no banco
    await host.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    host.activeDuels.set(duelIdStr, duel);

    return true; // Monstro foi destruído
  }
