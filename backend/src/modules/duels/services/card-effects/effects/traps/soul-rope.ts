import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Soul Rope / YGOPRO_37383714
 * 
 * When a monster(s) you control is destroyed by a card effect and sent to the Graveyard
 * (except during the Damage Step): Pay 1000 LP; Special Summon 1 Level 4 or lower monster
 * from your Deck.
 */

export const SOUL_ROPE_IDS = [
  'SoulRope',
  'YGOPRO_37383714',
  '37383714',
] as const;

/**
 * Check and activate Soul Rope when monster destroyed by card effect
 */
export async function checkAndActivateSoulRope(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  isDamageStep: boolean = false,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  
  // Cannot activate during Damage Step
  if (isDamageStep) {
    return false;
  }
  
  // Check if Jinzo is on field
  if (host.isJinzoOnField(duel)) {
    logger.info(`🤖 [SoulRope] Jinzo está no campo - não pode ativar`);
    return false;
  }
  
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  if (!playerField || !playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
    return false;
  }
  
  // Check if player has at least 1000 LP
  const playerLifePoints = Number(isPlayer1 ? duel.player1LifePoints : duel.player2LifePoints);
  if (playerLifePoints < 1000) {
    logger.info(`💔 [SoulRope] Jogador não tem LP suficientes (${playerLifePoints} < 1000)`);
    return false;
  }
  
  // Find set Soul Rope
  let soulRopeZone = -1;
  for (let i = 0; i < playerField.spellTrap.length; i++) {
    const trap = playerField.spellTrap[i];
    if (trap && trap !== null) {
      const trapId = trap.idCarta || trap.id || trap.cardId;
      const trapName = (trap.name || trap.cardName || '').toLowerCase();
      const trapPosition = trap.position || 'set';
      
      const isSoulRope =
        host.isExactCard(trap, 'SoulRope') ||
        trapId === 'SoulRope' ||
        trapId === 'soulrope' ||
        trapId === 'YGOPRO_37383714' ||
        trapId === '37383714' ||
        trapName === 'soul rope' ||
        trapName === 'corda da alma';
      
      if (isSoulRope && trapPosition === 'set') {
        soulRopeZone = i;
        logger.info(`🪢 [SoulRope] Encontrada na zona ${i}`);
        break;
      }
    }
  }
  
  if (soulRopeZone === -1) {
    return false;
  }
  
  // Find Level 4 or lower monsters in deck
  const deck = playerField.deck || [];
  const eligibleMonsters = deck.filter((card: any) => {
    const cardType = card.type || card.cardType;
    if (cardType !== 'Monster') return false;
    const level = Number(card.level || 0);
    return level > 0 && level <= 4;
  });
  
  if (eligibleMonsters.length === 0) {
    logger.info(`⚠️ [SoulRope] Não há monstros Level 4 ou menor no deck`);
    return false;
  }
  
  // Check if there's space on field
  if (!playerField.monsters || !Array.isArray(playerField.monsters)) {
    playerField.monsters = [null, null, null, null, null];
  }
  const emptyZoneIndex = playerField.monsters.findIndex((m: any) => m === null || m === undefined);
  if (emptyZoneIndex === -1) {
    logger.info(`⚠️ [SoulRope] Não há espaço no campo para invocar`);
    return false;
  }
  
  logger.info(`🪢 [SoulRope] Ativada! Pagando 1000 LP e invocando monstro do deck`);
  
  // Pay 1000 LP
  if (isPlayer1) {
    (duel as any).player1LifePoints = Math.max(0, playerLifePoints - 1000);
  } else {
    (duel as any).player2LifePoints = Math.max(0, playerLifePoints - 1000);
  }
  
  // Move Soul Rope to graveyard
  const soulRope = playerField.spellTrap[soulRopeZone];
  if (!playerField.graveyard) {
    playerField.graveyard = [];
  }
  playerField.graveyard.push(soulRope);
  playerField.spellTrap[soulRopeZone] = null;
  
  // Recalculate Mage Power (spell/trap removed from field)
  await host.recalculateMagePowerAtk(duelId, duel, isPlayer1);
  
  // This will need a pending choice to select monster from deck
  // For now, auto-select the first eligible monster
  const monsterToSummon = eligibleMonsters[0];
  
  // Remove from deck
  const deckIndex = deck.findIndex((c: any) => 
    (c.id || c.idCarta || c.cardId) === (monsterToSummon.id || monsterToSummon.idCarta || monsterToSummon.cardId)
  );
  if (deckIndex !== -1) {
    deck.splice(deckIndex, 1);
  }
  
  // Special Summon to field in attack position
  monsterToSummon.position = 'attack';
  monsterToSummon.isFaceUp = true;
  playerField.monsters[emptyZoneIndex] = monsterToSummon;
  
  logger.info(`✅ [SoulRope] ${monsterToSummon.name || monsterToSummon.cardName} invocado na zona ${emptyZoneIndex}`);
  
  // Update database
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
    player1LifePoints: (duel as any).player1LifePoints,
    player2LifePoints: (duel as any).player2LifePoints,
  } as any);
  
  // Update cache
  host.activeDuels.set(duelIdStr, duel);
  
  return true;
}
