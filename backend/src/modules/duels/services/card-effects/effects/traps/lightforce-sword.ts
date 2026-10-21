import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Lightforce Sword (YGOPRO_49587034)
 * Trap: Banish 1 random card from opponent's hand face-down; return it to their hand
 * during their 4th Standby Phase after activation.
 */
export async function checkAndActivateLightforceSword(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  
  if (host.isJinzoOnField(duel)) {
    logger.info(`🤖 [LightforceSword] Jinzo está no campo - trap não pode ser ativada`);
    return false;
  }
  
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
  
  if (!playerField || !playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
    return false;
  }
  
  // Find Lightforce Sword set
  let lightforceZone = -1;
  for (let i = 0; i < playerField.spellTrap.length; i++) {
    const trap = playerField.spellTrap[i];
    if (trap && trap !== null) {
      const trapPosition = trap.position || 'set';
      const isLightforce = host.isExactCard(trap, 'LightforceSword') || 
                          host.isExactCard(trap, 'YGOPRO_49587034');
      if (isLightforce && trapPosition === 'set') {
        lightforceZone = i;
        logger.info(`⚔️ [LightforceSword] Encontrada na zona ${i}`);
        break;
      }
    }
  }
  
  if (lightforceZone === -1) {
    return false;
  }
  
  // Check opponent has cards in hand
  if (!opponentField?.hand || opponentField.hand.length === 0) {
    logger.info(`ℹ️ [LightforceSword] Oponente não tem cartas na mão`);
    return false;
  }
  
  logger.info(`⚔️ [LightforceSword] Ativada! Banindo 1 carta aleatória da mão do oponente`);
  
  // Banish random card from opponent's hand
  const randomIdx = Math.floor(Math.random() * opponentField.hand.length);
  const banishedCard = opponentField.hand.splice(randomIdx, 1)[0];
  
  if (!opponentField.banished) opponentField.banished = [];
  opponentField.banished.push({
    ...banishedCard,
    lightforceSwordBanished: true,
    lightforceSwordActivatedTurn: duel.turnCounter || 1,
    lightforceSwordOwner: !isPlayer1, // owner is opponent
  });
  
  logger.info(`⚔️ [LightforceSword] Baniu ${banishedCard.name || banishedCard.cardName || 'carta'}`);
  
  // Move Lightforce Sword to GY
  const lightforceTrap = playerField.spellTrap[lightforceZone];
  if (lightforceTrap) {
    if (!playerField.graveyard) playerField.graveyard = [];
    playerField.graveyard.push(lightforceTrap);
    playerField.spellTrap[lightforceZone] = null;
    logger.info(`✅ [LightforceSword] Movida para o cemitério após ativação`);
    await host.recalculateMagePowerAtk(duelId, duel, isPlayer1);
  }
  
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);
  
  host.activeDuels.set(duelIdStr, duel);
  
  return true;
}
