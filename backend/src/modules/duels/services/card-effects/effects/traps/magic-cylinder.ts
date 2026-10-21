import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Magic Cylinder / YGOPRO_62279055
 * 
 * When an opponent's monster declares an attack: Target the attacking monster;
 * negate the attack, and if you do, inflict damage to your opponent equal to its ATK.
 */
export async function checkAndActivateMagicCylinder(
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
    logger.info(`🤖 [checkAndActivateMagicCylinder] Jinzo está no campo - Magic Cylinder não pode ser ativada`);
    return false;
  }

  // Check if MirageDragon is blocking traps
  if (host.isMirageDragonBlockingTraps(duel, !isPlayer1)) {
    logger.info(`🐉 [checkAndActivateMagicCylinder] MirageDragon está no campo do atacante - Magic Cylinder não pode ser ativada durante Fase de Batalha`);
    return false;
  }

  const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

  if (!opponentField || !opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
    return false;
  }

  // Find Magic Cylinder that is set (face-down)
  let magicCylinderZoneIndex = -1;
  for (let i = 0; i < opponentField.spellTrap.length; i++) {
    const trap = opponentField.spellTrap[i];
    if (trap && trap !== null) {
      const trapId = trap.idCarta || trap.id || trap.cardId;
      const trapName = (trap.name || trap.cardName || '').toLowerCase();
      const trapPosition = trap.position || 'set';

      const isMagicCylinder =
        host.isExactCard(trap, 'MagicCylinder') ||
        trapId === 'MagicCylinder' ||
        trapId === 'magiccylinder' ||
        trapId === 'YGOPRO_62279055' ||
        trapId === '62279055' ||
        trapName === 'magic cylinder' ||
        trapName === 'cilindro magico' ||
        trapName === 'cilindro mágico';

      // Magic Cylinder must be set (face-down)
      if (isMagicCylinder && trapPosition === 'set') {
        magicCylinderZoneIndex = i;
        logger.info(`🪄 [checkAndActivateMagicCylinder] Magic Cylinder encontrada na zona ${i} do oponente`);
        break;
      }
    }
  }

  if (magicCylinderZoneIndex === -1) {
    return false; // No Magic Cylinder set
  }

  const attackerAtk = attacker.atk || 0;
  logger.info(`💥 [checkAndActivateMagicCylinder] Magic Cylinder ativada! Negando ataque e causando ${attackerAtk} de dano ao jogador atacante`);

  // Inflict damage equal to attacker's ATK to the attacker player
  const attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  if (!attackerField.lifePoints) attackerField.lifePoints = 8000;
  attackerField.lifePoints = Math.max(0, attackerField.lifePoints - attackerAtk);
  logger.info(`💔 [checkAndActivateMagicCylinder] ${isPlayer1 ? 'Player 1' : 'Player 2'} recebeu ${attackerAtk} de dano. LP: ${attackerField.lifePoints}`);

  // Move Magic Cylinder to graveyard
  const magicCylinder = opponentField.spellTrap[magicCylinderZoneIndex];
  if (magicCylinder) {
    if (!opponentField.graveyard) {
      opponentField.graveyard = [];
    }
    opponentField.graveyard.push(magicCylinder);
    opponentField.spellTrap[magicCylinderZoneIndex] = null;
    logger.info(`✅ [checkAndActivateMagicCylinder] Magic Cylinder movida para o cemitério após ativação`);
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

  return true; // Attack was negated
}
