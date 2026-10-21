/**
 * Spellbinding Circle (Continuous Trap)
 * 
 * Activate targeting 1 opponent monster; it cannot attack or change battle position.
 * When that monster is destroyed, destroy this card.
 */

import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

export const SPELLBINDING_CIRCLE_KEY = 'spellbinding-circle';

export const SPELLBINDING_CIRCLE_IDS = [
  'SpellbindingCircle',
  'YGOPRO_18807109',
  '18807109',
] as const;

/**
 * Check and activate Spellbinding Circle when opponent summons a monster
 */
export async function checkAndActivateSpellbindingCircle(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  targetMonsterZone: number,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  
  // Check if Jinzo is on field
  if (host.isJinzoOnField(duel)) {
    logger.info(`🤖 [SpellbindingCircle] Jinzo está no campo - não pode ativar`);
    return false;
  }
  
  // Check for Mirage Dragon during Battle Phase
  if (host.isMirageDragonBlockingTraps(duel, !isPlayer1)) {
    logger.info(`🐉 [SpellbindingCircle] Mirage Dragon bloqueando - não pode ativar durante Fase de Batalha`);
    return false;
  }
  
  const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
  
  if (!opponentField?.spellTrap || !Array.isArray(opponentField.spellTrap)) {
    return false;
  }
  
  // Find set Spellbinding Circle
  let circleZone = -1;
  for (let i = 0; i < opponentField.spellTrap.length; i++) {
    const trap = opponentField.spellTrap[i];
    if (trap && trap !== null) {
      const trapPosition = trap.position || 'set';
      const isCircle = host.isExactCard(trap, 'SpellbindingCircle');
      
      if (isCircle && trapPosition === 'set') {
        circleZone = i;
        logger.info(`🔮 [SpellbindingCircle] Encontrada na zona ${i}`);
        break;
      }
    }
  }
  
  if (circleZone === -1) {
    return false;
  }
  
  // Get target monster
  const attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  const targetMonster = attackerField.monsters?.[targetMonsterZone];
  
  if (!targetMonster) {
    logger.info(`⚠️ [SpellbindingCircle] Monstro alvo não encontrado`);
    return false;
  }
  
  logger.info(`🔮 [SpellbindingCircle] Ativada! Bloqueando monstro na zona ${targetMonsterZone}`);
  
  // Flip trap to face-up and mark as continuous
  const circleCard = opponentField.spellTrap[circleZone];
  circleCard.position = 'face-up';
  circleCard.isContinuous = true;
  circleCard.targetPlayer = isPlayer1 ? 1 : 2;
  circleCard.targetMonsterZone = targetMonsterZone;
  
  // Mark monster as spellbound
  targetMonster.spellboundByCircle = true;
  targetMonster.spellbindingCircleZone = circleZone;
  targetMonster.spellbindingCircleOwner = !isPlayer1; // owner of the trap
  
  // Update database
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);
  
  // Update cache
  host.activeDuels.set(duelIdStr, duel);
  
  logger.info(`✅ [SpellbindingCircle] Ativada e bloqueou monstro`);
  return true;
}

/**
 * Check if Spellbinding Circle should be destroyed when its target is destroyed
 */
export async function checkSpellbindingCircleOnMonsterDestruction(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  monsterZone: number,
): Promise<void> {
  const monster = isPlayer1 
    ? (duel as any).player1Field?.monsters?.[monsterZone]
    : (duel as any).player2Field?.monsters?.[monsterZone];
  
  if (!monster?.spellboundByCircle) {
    return;
  }
  
  const circleOwnerIsPlayer1 = monster.spellbindingCircleOwner;
  const circleZone = monster.spellbindingCircleZone;
  
  if (circleZone === undefined || circleZone === null) {
    return;
  }
  
  const circleOwnerField = circleOwnerIsPlayer1 
    ? (duel as any).player1Field 
    : (duel as any).player2Field;
  
  const circle = circleOwnerField?.spellTrap?.[circleZone];
  
  if (!circle) {
    return;
  }
  
  logger.info(`🔮 [SpellbindingCircle] Monstro alvo foi destruído - destruindo Spellbinding Circle`);
  
  // Destroy Spellbinding Circle
  if (!circleOwnerField.graveyard) circleOwnerField.graveyard = [];
  circleOwnerField.graveyard.push(circle);
  circleOwnerField.spellTrap[circleZone] = null;
  
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);
  
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  host.activeDuels.set(duelIdStr, duel);
}
