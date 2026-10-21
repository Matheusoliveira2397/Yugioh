import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Dust Tornado / YGOPRO_60082869
 * 
 * Target 1 Spell/Trap your opponent controls; destroy that target, then you can Set 1 Spell/Trap from your hand.
 */
export async function checkAndActivateDustTornado(
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
    logger.info(`🤖 [checkAndActivateDustTornado] Jinzo está no campo - Dust Tornado não pode ser ativada`);
    return false;
  }

  // Check if MirageDragon is blocking traps
  if (host.isMirageDragonBlockingTraps(duel, !isPlayer1)) {
    logger.info(`🐉 [checkAndActivateDustTornado] MirageDragon está no campo do atacante - Dust Tornado não pode ser ativada durante Fase de Batalha`);
    return false;
  }

  const defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
  const attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

  if (!defenderField || !defenderField.spellTrap || !Array.isArray(defenderField.spellTrap)) {
    return false;
  }

  // Find Dust Tornado that is set (face-down)
  let dustTornadoZoneIndex = -1;
  for (let i = 0; i < defenderField.spellTrap.length; i++) {
    const trap = defenderField.spellTrap[i];
    if (trap && trap !== null) {
      const trapId = trap.idCarta || trap.id || trap.cardId;
      const trapName = (trap.name || trap.cardName || '').toLowerCase();
      const trapPosition = trap.position || 'set';

      const isDustTornado =
        host.isExactCard(trap, 'DustTornado') ||
        trapId === 'DustTornado' ||
        trapId === 'dusttornado' ||
        trapId === 'YGOPRO_60082869' ||
        trapId === '60082869' ||
        trapName === 'dust tornado' ||
        trapName === 'tornado de po' ||
        trapName === 'tornado de pó';

      // Dust Tornado must be set (face-down)
      if (isDustTornado && trapPosition === 'set') {
        dustTornadoZoneIndex = i;
        logger.info(`🌪️ [checkAndActivateDustTornado] Dust Tornado encontrada na zona ${i} do defensor`);
        break;
      }
    }
  }

  if (dustTornadoZoneIndex === -1) {
    return false; // No Dust Tornado set
  }

  // Check if opponent has any Spell/Trap cards on field
  if (!attackerField.spellTrap || !Array.isArray(attackerField.spellTrap)) {
    attackerField.spellTrap = [null, null, null, null, null];
  }

  const opponentSpellTraps = attackerField.spellTrap.filter((st: any) => st !== null && st !== undefined);
  
  if (opponentSpellTraps.length === 0) {
    logger.info(`⚠️ [checkAndActivateDustTornado] Nenhuma Spell/Trap do oponente para destruir - Dust Tornado não ativa`);
    return false; // Cannot activate without target
  }

  logger.info(`🌪️ [checkAndActivateDustTornado] Dust Tornado ativada! Preparando para escolher alvo...`);

  // Create pending choice for target selection
  await host.setPendingChoice(duelId, {
    type: 'DUST_TORNADO',
    userId: isPlayer1 ? Number(duel.player2Id) : Number(duel.player1Id),
    turnWhenStarted: duel.currentTurn,
    phaseWhenStarted: duel.currentPhase || 'BATTLE',
    data: {
      dustTornadoZoneIndex,
      attackWasNegated: true,
    },
  });

  // Move Dust Tornado to graveyard
  const dustTornado = defenderField.spellTrap[dustTornadoZoneIndex];
  if (dustTornado) {
    if (!defenderField.graveyard) {
      defenderField.graveyard = [];
    }
    defenderField.graveyard.push(dustTornado);
    defenderField.spellTrap[dustTornadoZoneIndex] = null;
    logger.info(`✅ [checkAndActivateDustTornado] Dust Tornado movida para o cemitério após ativação`);
    // Recalculate Mage Power for defender (spell/trap removed from field)
    await host.recalculateMagePowerAtk(duelId, duel, !isPlayer1);
  }

  // Update database
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
    pendingChoice: (duel as any).pendingChoice,
  } as any);

  // Update cache
  host.activeDuels.set(duelIdStr, duel);

  return true; // Attack was not negated, but trap activated and needs target selection
}
