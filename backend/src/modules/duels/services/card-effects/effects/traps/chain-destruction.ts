import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Chain Destruction / YGOPRO_1248895
 * 
 * When a monster(s) with 2000 or less ATK is Summoned: Target 1 of those monsters;
 * destroy all cards with that name in the hand and Main Deck of the player who Summoned it.
 */

export const CHAIN_DESTRUCTION_IDS = [
  'ChainDestruction',
  'YGOPRO_1248895',
  '1248895',
] as const;

/**
 * Check and activate Chain Destruction when monster with ATK <= 2000 is summoned
 */
export async function checkAndActivateChainDestruction(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  summonedMonsterZone: number,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  
  // Check if Jinzo is on field
  if (host.isJinzoOnField(duel)) {
    logger.info(`🤖 [ChainDestruction] Jinzo está no campo - não pode ativar`);
    return false;
  }
  
  const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
  const summonerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  if (!opponentField || !opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
    return false;
  }
  
  // Get summoned monster
  const summonedMonster = summonerField.monsters?.[summonedMonsterZone];
  if (!summonedMonster) {
    return false;
  }
  
  // Check if monster has ATK <= 2000
  const monsterAtk = Number(summonedMonster.atk || summonedMonster.ATK || 0);
  if (monsterAtk > 2000) {
    logger.info(`⚠️ [ChainDestruction] Monstro tem ATK > 2000 (${monsterAtk})`);
    return false;
  }
  
  // Find set Chain Destruction
  let chainDestructionZone = -1;
  for (let i = 0; i < opponentField.spellTrap.length; i++) {
    const trap = opponentField.spellTrap[i];
    if (trap && trap !== null) {
      const trapId = trap.idCarta || trap.id || trap.cardId;
      const trapName = (trap.name || trap.cardName || '').toLowerCase();
      const trapPosition = trap.position || 'set';
      
      const isChainDestruction =
        host.isExactCard(trap, 'ChainDestruction') ||
        trapId === 'ChainDestruction' ||
        trapId === 'chaindestruction' ||
        trapId === 'YGOPRO_1248895' ||
        trapId === '1248895' ||
        trapName === 'chain destruction' ||
        trapName === 'destruição em cadeia';
      
      if (isChainDestruction && trapPosition === 'set') {
        chainDestructionZone = i;
        logger.info(`💥 [ChainDestruction] Encontrada na zona ${i}`);
        break;
      }
    }
  }
  
  if (chainDestructionZone === -1) {
    return false;
  }
  
  const monsterName = (summonedMonster.name || summonedMonster.cardName || '').toLowerCase();
  const monsterId = summonedMonster.idCarta || summonedMonster.id || summonedMonster.cardId;
  
  logger.info(`💥 [ChainDestruction] Ativada! Destruindo todas as cópias de ${monsterName} na mão e deck do invocador`);
  
  let destroyedCount = 0;
  
  // Destroy copies in hand
  if (summonerField.hand && Array.isArray(summonerField.hand)) {
    const cardsToDestroy: any[] = [];
    summonerField.hand = summonerField.hand.filter((card: any) => {
      const cardName = (card.name || card.cardName || '').toLowerCase();
      const cardId = card.idCarta || card.id || card.cardId;
      const isMatch = cardName === monsterName || cardId === monsterId;
      if (isMatch) {
        cardsToDestroy.push(card);
        destroyedCount++;
      }
      return !isMatch;
    });
    
    // Move destroyed cards to graveyard
    if (cardsToDestroy.length > 0) {
      if (!summonerField.graveyard) summonerField.graveyard = [];
      summonerField.graveyard.push(...cardsToDestroy);
      logger.info(`💥 [ChainDestruction] Destruídas ${cardsToDestroy.length} cópias na mão`);
    }
  }
  
  // Destroy copies in deck
  if (summonerField.deck && Array.isArray(summonerField.deck)) {
    const cardsToDestroy: any[] = [];
    summonerField.deck = summonerField.deck.filter((card: any) => {
      const cardName = (card.name || card.cardName || '').toLowerCase();
      const cardId = card.idCarta || card.id || card.cardId;
      const isMatch = cardName === monsterName || cardId === monsterId;
      if (isMatch) {
        cardsToDestroy.push(card);
        destroyedCount++;
      }
      return !isMatch;
    });
    
    // Move destroyed cards to graveyard
    if (cardsToDestroy.length > 0) {
      if (!summonerField.graveyard) summonerField.graveyard = [];
      summonerField.graveyard.push(...cardsToDestroy);
      logger.info(`💥 [ChainDestruction] Destruídas ${cardsToDestroy.length} cópias no deck`);
    }
  }
  
  logger.info(`💥 [ChainDestruction] Total de ${destroyedCount} cópias destruídas`);
  
  // Move Chain Destruction to graveyard
  const chainDestruction = opponentField.spellTrap[chainDestructionZone];
  if (!opponentField.graveyard) {
    opponentField.graveyard = [];
  }
  opponentField.graveyard.push(chainDestruction);
  opponentField.spellTrap[chainDestructionZone] = null;
  
  logger.info(`✅ [ChainDestruction] Chain Destruction movida para o cemitério após ativação`);
  
  // Recalculate Mage Power for opponent (spell/trap removed from field)
  await host.recalculateMagePowerAtk(duelId, duel, !isPlayer1);
  
  // Update database
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);
  
  // Update cache
  host.activeDuels.set(duelIdStr, duel);
  
  return true;
}
