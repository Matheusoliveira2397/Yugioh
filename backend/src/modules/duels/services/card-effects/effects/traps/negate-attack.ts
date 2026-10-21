import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Negate Attack / YGOPRO_14315573
 * 
 * When opponent's monster declares an attack: Target attacking monster;
 * negate the attack and end the Battle Phase.
 */
export async function checkAndActivateNegateAttack(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  attackerZoneIndex: number,
  attacker: any,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

  // Check if Jinzo is on field - if so, traps cannot be activated
  if (host.isJinzoOnField(duel)) {
    logger.info(`🤖 [checkAndActivateNegateAttack] Jinzo está no campo - Negate Attack não pode ser ativada`);
    return false;
  }

  // Check if MirageDragon is blocking traps
  if (host.isMirageDragonBlockingTraps(duel, !isPlayer1)) {
    logger.info(`🐉 [checkAndActivateNegateAttack] MirageDragon está no campo do atacante - Negate Attack não pode ser ativada durante Fase de Batalha`);
    return false;
  }

  const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

  if (!opponentField || !opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
    return false;
  }

  // Find Negate Attack that is set (face-down)
  let negateAttackZoneIndex = -1;
  for (let i = 0; i < opponentField.spellTrap.length; i++) {
    const trap = opponentField.spellTrap[i];
    if (trap && trap !== null) {
      const trapId = trap.idCarta || trap.id || trap.cardId;
      const trapName = (trap.name || trap.cardName || '').toLowerCase();
      const trapPosition = trap.position || 'set';

      const isNegateAttack =
        host.isExactCard(trap, 'NegateAttack') ||
        trapId === 'NegateAttack' ||
        trapId === 'negateattack' ||
        trapId === 'YGOPRO_14315573' ||
        trapId === '14315573' ||
        trapName === 'negate attack' ||
        trapName === 'negar ataque';

      // Negate Attack must be set (face-down)
      if (isNegateAttack && trapPosition === 'set') {
        negateAttackZoneIndex = i;
        logger.info(`🛡️ [checkAndActivateNegateAttack] Negate Attack encontrada na zona ${i} do oponente`);
        break;
      }
    }
  }

  if (negateAttackZoneIndex === -1) {
    return false; // No Negate Attack set
  }

  logger.info(`💥 [checkAndActivateNegateAttack] Negate Attack ativada! Negando ataque e terminando a Battle Phase`);

  // Move Negate Attack to graveyard
  const negateAttack = opponentField.spellTrap[negateAttackZoneIndex];
  if (negateAttack) {
    if (!opponentField.graveyard) {
      opponentField.graveyard = [];
    }
    opponentField.graveyard.push(negateAttack);
    opponentField.spellTrap[negateAttackZoneIndex] = null;
    logger.info(`✅ [checkAndActivateNegateAttack] Negate Attack movida para o cemitério após ativação`);
    // Recalculate Mage Power for opponent (spell/trap removed from field)
    await host.recalculateMagePowerAtk(duelId, duel, !isPlayer1);
  }

  // Update database
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);

  // Update cache
  host.activeDuels.set(duelIdStr, duel);

  // Caller (DuelsService) ends Battle Phase via goToPhase(MAIN2)
  return true; // Attack was negated
}
