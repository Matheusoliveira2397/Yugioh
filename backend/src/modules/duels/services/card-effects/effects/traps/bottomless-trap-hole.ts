import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/** Trap activation — bottomless-trap-hole (effects/traps) */
export async function checkAndActivateBottomlessTrapHole(host: any, duelId: string | number, duel: Duel, isPlayer1: boolean, monsterZoneIndex: number, monster: any): Promise<boolean> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    if (host.isObeliskTheTormentor(monster)) {
      logger.info(`🔒 [checkAndActivateBottomlessTrapHole] Obelisk the Tormentor - invocação não pode ser negada`);
      return false;
    }
    if (host.isJinzoOnField(duel)) {
      logger.info(`🤖 [checkAndActivateBottomlessTrapHole] Jinzo está no campo - Bottomless Trap Hole não pode ser ativada`);
      return false;
    }

    if (host.isMirageDragonBlockingTraps(duel, !isPlayer1)) {
      logger.info(`🐉 [checkAndActivateBottomlessTrapHole] MirageDragon está no campo - Bottomless Trap Hole não pode ser ativada durante Fase de Batalha`);
      return false;
    }

    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!opponentField || !opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
      return false;
    }

    let bottomlessZoneIndex = -1;
    for (let i = 0; i < opponentField.spellTrap.length; i++) {
      const trap = opponentField.spellTrap[i];
      if (trap && trap !== null) {
        const trapPosition = trap.position || 'set';
        const isBottomless = host.isExactCard(trap, 'BottomlessTrapHole');
        if (isBottomless && trapPosition === 'set') {
          bottomlessZoneIndex = i;
          logger.info(`🕳️ [checkAndActivateBottomlessTrapHole] Bottomless Trap Hole encontrada na zona ${i} do oponente`);
          break;
        }
      }
    }

    if (bottomlessZoneIndex === -1) {
      return false;
    }

    const monsterAtk = monster.atk || 0;
    if (monsterAtk < 1500) {
      logger.info(`ℹ️ [checkAndActivateBottomlessTrapHole] Monstro ${monster.name} tem apenas ${monsterAtk} de ATK (precisa 1500+), Bottomless não ativa`);
      return false;
    }

    logger.info(`💥 [checkAndActivateBottomlessTrapHole] Bottomless Trap Hole ativada! Destruindo e banindo ${monster.name} (ATK: ${monsterAtk})`);

    await host.handleEquipmentDestruction(duelId, duel, isPlayer1, monster);

    const ownerField = host.getOwnerFieldForMonster(duel, monster, isPlayer1);
    if (!ownerField.banished) ownerField.banished = [];
    ownerField.banished.push(monster);
    playerField.monsters[monsterZoneIndex] = null;

    if (!playerField.monsterDestroyedThisTurn) {
      playerField.monsterDestroyedThisTurn = true;
      logger.info(`✅ [checkAndActivateBottomlessTrapHole] Monstro destruído e banido - Last Will pode ser ativada`);
    }

    await host.recalculateUnitedWeStandForBothPlayers(duelId, duel);

    const bottomlessTrap = opponentField.spellTrap[bottomlessZoneIndex];
    if (bottomlessTrap) {
      if (!opponentField.graveyard) opponentField.graveyard = [];
      opponentField.graveyard.push(bottomlessTrap);
      opponentField.spellTrap[bottomlessZoneIndex] = null;
      logger.info(`✅ [checkAndActivateBottomlessTrapHole] Bottomless Trap Hole movida para o cemitério do oponente após ativação`);
      await host.recalculateMagePowerAtk(duelId, duel, !isPlayer1);
    }

    await host.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    host.activeDuels.set(duelIdStr, duel);

    return true;
  }
