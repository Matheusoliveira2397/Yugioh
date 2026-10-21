import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';
import * as Pts from '../spells/player-target-spell.helpers';
import { TurnPhase, DuelResult } from '../../../../entities/duel.entity';

/** Trap activation — ring-of-destruction (effects/traps) */
export async function checkAndActivateRingOfDestruction(host: any, 
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    attackerZoneIndex: number,
    attacker: any,
  ): Promise<boolean> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    if (!attacker || attacker.position !== 'attack') {
      return false;
    }

    if (host.isJinzoOnField(duel)) {
      logger.info(`🤖 [checkAndActivateRingOfDestruction] Jinzo no campo — Ring of Destruction não pode ser ativada`);
      return false;
    }

    if (host.isMirageDragonBlockingTraps(duel, !isPlayer1)) {
      logger.info(
        `🐉 [checkAndActivateRingOfDestruction] Mirage Dragon no campo do atacante — defensor não pode ativar armadilhas na Battle Phase`,
      );
      return false;
    }

    const defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!defenderField?.spellTrap || !Array.isArray(defenderField.spellTrap)) {
      return false;
    }

    let ringZoneIndex = -1;
    for (let i = 0; i < defenderField.spellTrap.length; i++) {
      const trap = defenderField.spellTrap[i];
      if (!trap || trap === null) continue;
      const pos = trap.position || 'set';
      if (pos !== 'set') continue;
      if (Pts.matchesPlayerTargetSpellCard(trap, 'RING_OF_DESTRUCTION')) {
        if (host.isNormalTrapBlockedSameTurnSet(duel, trap)) {
          logger.info(
            `💍 [checkAndActivateRingOfDestruction] Ring foi colocada neste turno (turnCounter ${duel.turnCounter}) — não pode ativar ainda`,
          );
          return false;
        }
        ringZoneIndex = i;
        logger.info(`💍 [checkAndActivateRingOfDestruction] Ring of Destruction encontrada na zona ${i} do defensor`);
        break;
      }
    }

    if (ringZoneIndex < 0) {
      return false;
    }

    if (!Pts.isFaceUpMonster(attacker)) {
      return false;
    }

    const damage = host.getTotalMonsterAtk(attacker, duel, isPlayer1, duel.currentPhase || TurnPhase.BATTLE);
    logger.info(
      `💍 [checkAndActivateRingOfDestruction] Ativada! Alvo: ${attacker.name || attacker.cardName} (ATK ${damage} para dano)`,
    );

    await host.handleEquipmentDestruction(duelId, duel, isPlayer1, attacker);
    const ownerFieldRing = host.getOwnerFieldForMonster(duel, attacker, isPlayer1);
    if (!ownerFieldRing.graveyard) ownerFieldRing.graveyard = [];
    ownerFieldRing.graveyard.push(attacker);
    attackerField.monsters[attackerZoneIndex] = null;

    if (!attackerField.monsterDestroyedThisTurn) {
      attackerField.monsterDestroyedThisTurn = true;
      logger.info(`✅ [checkAndActivateRingOfDestruction] Monstro atacante destruído — Last Will pode ser ativada`);
    }

    await host.recalculateUnitedWeStandForBothPlayers(duelId, duel);

    const ringCard = defenderField.spellTrap[ringZoneIndex];
    if (ringCard) {
      if (!defenderField.graveyard) defenderField.graveyard = [];
      defenderField.graveyard.push(ringCard);
      defenderField.spellTrap[ringZoneIndex] = null;
      await host.recalculateMagePowerAtk(duelId, duel, !isPlayer1);
    }

    duel.player1LifePoints = Math.max(0, (duel.player1LifePoints || 0) - damage);
    duel.player2LifePoints = Math.max(0, (duel.player2LifePoints || 0) - damage);

    await host.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      player1LifePoints: duel.player1LifePoints,
      player2LifePoints: duel.player2LifePoints,
    } as any);

    host.activeDuels.set(duelIdStr, duel);

    if (duel.player1LifePoints <= 0 || duel.player2LifePoints <= 0) {
      const winnerId = duel.player1LifePoints <= 0 ? duel.player2Id : duel.player1Id;
      await host.finishDuel(
        duelIdStr,
        duel.player1LifePoints <= 0 ? DuelResult.PLAYER2_WIN : DuelResult.PLAYER1_WIN,
        winnerId as number,
      );
    }

    return true;
  }
