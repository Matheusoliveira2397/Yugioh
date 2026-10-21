import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Fiendish Chain / YGOPRO_50078509
 * Continuous Trap
 * 
 * Target 1 Effect Monster on the field; negate the effects of that face-up monster
 * while it is face-up on the field, also that target cannot attack.
 * When that target is destroyed, destroy this card.
 */

export const FIENDISH_CHAIN_IDS = [
  'FiendishChain',
  'YGOPRO_50078509',
  '50078509',
] as const;

/**
 * Check if Fiendish Chain should be destroyed when its target is destroyed
 */
export async function checkFiendishChainOnMonsterDestruction(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  monsterZone: number,
): Promise<void> {
  const monster = isPlayer1 
    ? (duel as any).player1Field?.monsters?.[monsterZone]
    : (duel as any).player2Field?.monsters?.[monsterZone];
  
  if (!monster?.fiendishChained) {
    return;
  }
  
  const chainOwner = monster.fiendishChainOwner;
  const chainZone = monster.fiendishChainZone;
  
  if (chainZone === undefined || chainZone === null || chainOwner === undefined) {
    return;
  }
  
  const chainOwnerField = chainOwner 
    ? (duel as any).player1Field 
    : (duel as any).player2Field;
  
  const chain = chainOwnerField?.spellTrap?.[chainZone];
  
  if (!chain) {
    return;
  }
  
  logger.info(`⛓️ [FiendishChain] Monstro alvo foi destruído - destruindo Fiendish Chain`);
  
  // Destroy Fiendish Chain
  if (!chainOwnerField.graveyard) chainOwnerField.graveyard = [];
  chainOwnerField.graveyard.push(chain);
  chainOwnerField.spellTrap[chainZone] = null;
  
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);
  
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  host.activeDuels.set(duelIdStr, duel);
}

/**
 * Check if Fiendish Chain is on field and active
 */
export function checkAndActivateFiendishChain(
  host: any,
  duel: Duel,
  isPlayer1: boolean,
  targetMonsterZone: number,
): boolean {
  // Check if Jinzo is on field
  if (host.isJinzoOnField(duel)) {
    logger.info(`🤖 [FiendishChain] Jinzo está no campo - não pode ativar`);
    return false;
  }
  
  // Check for Mirage Dragon during Battle Phase
  if (host.isMirageDragonBlockingTraps(duel, !isPlayer1)) {
    logger.info(`🐉 [FiendishChain] Mirage Dragon bloqueando - não pode ativar durante Fase de Batalha`);
    return false;
  }
  
  const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
  
  if (!opponentField?.spellTrap || !Array.isArray(opponentField.spellTrap)) {
    return false;
  }
  
  // Find set Fiendish Chain
  let chainZone = -1;
  for (let i = 0; i < opponentField.spellTrap.length; i++) {
    const trap = opponentField.spellTrap[i];
    if (trap && trap !== null) {
      const trapPosition = trap.position || 'set';
      const isChain = host.isExactCard(trap, 'FiendishChain');
      
      if (isChain && trapPosition === 'set') {
        chainZone = i;
        logger.info(`⛓️ [FiendishChain] Encontrada na zona ${i}`);
        break;
      }
    }
  }
  
  if (chainZone === -1) {
    return false;
  }
  
  // Get target monster
  const attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  const targetMonster = attackerField.monsters?.[targetMonsterZone];
  
  if (!targetMonster) {
    logger.info(`⚠️ [FiendishChain] Monstro alvo não encontrado`);
    return false;
  }
  
  // Check if target is an Effect Monster
  const monsterType = (targetMonster.monsterType || targetMonster.monster_type || '').toLowerCase();
  if (monsterType !== 'effect' && monsterType !== 'efeito') {
    logger.info(`⚠️ [FiendishChain] Alvo não é Effect Monster`);
    return false;
  }
  
  logger.info(`⛓️ [FiendishChain] Ativada! Negando efeitos e ataques do monstro na zona ${targetMonsterZone}`);
  
  // Flip trap to face-up and mark as continuous
  const chainCard = opponentField.spellTrap[chainZone];
  chainCard.position = 'face-up';
  chainCard.isContinuous = true;
  chainCard.targetPlayer = isPlayer1 ? 1 : 2;
  chainCard.targetMonsterZone = targetMonsterZone;
  
  // Mark monster as fiendish chained
  targetMonster.fiendishChained = true;
  targetMonster.fiendishChainZone = chainZone;
  targetMonster.fiendishChainOwner = !isPlayer1; // owner of the trap
  
  logger.info(`✅ [FiendishChain] Ativada e bloqueou monstro`);
  return true;
}
