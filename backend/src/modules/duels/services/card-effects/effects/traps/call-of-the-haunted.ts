import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Call of the Haunted / YGOPRO_97077563
 * Continuous Trap
 * 
 * Target 1 monster in your GY; Special Summon it in Attack Position.
 * When this card leaves the field, destroy that monster.
 * When that monster is destroyed, destroy this card.
 */

export const CALL_OF_THE_HAUNTED_IDS = [
  'CallOfTheHaunted',
  'YGOPRO_97077563',
  '97077563',
] as const;

/**
 * Check if Call of the Haunted should be destroyed when its target is destroyed
 */
export async function checkCallOfTheHauntedOnMonsterDestruction(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  monsterZone: number,
): Promise<void> {
  const monster = isPlayer1 
    ? (duel as any).player1Field?.monsters?.[monsterZone]
    : (duel as any).player2Field?.monsters?.[monsterZone];
  
  if (!monster?.callOfTheHauntedEquipped) {
    return;
  }
  
  const trapZone = monster.callOfTheHauntedZone;
  
  if (trapZone === undefined || trapZone === null) {
    return;
  }
  
  const playerField = isPlayer1 
    ? (duel as any).player1Field 
    : (duel as any).player2Field;
  
  const trap = playerField?.spellTrap?.[trapZone];
  
  if (!trap) {
    return;
  }
  
  logger.info(`📞 [CallOfTheHaunted] Monstro alvo foi destruído - destruindo Call of the Haunted`);
  
  // Destroy Call of the Haunted
  if (!playerField.graveyard) playerField.graveyard = [];
  playerField.graveyard.push(trap);
  playerField.spellTrap[trapZone] = null;
  
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);
  
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  host.activeDuels.set(duelIdStr, duel);
}

/**
 * Check if monster should be destroyed when Call of the Haunted leaves the field
 */
export async function checkCallOfTheHauntedOnTrapDestruction(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  trapZone: number,
  trap: any,
): Promise<void> {
  if (!trap?.equippedToMonsterZoneIndex && trap?.equippedToMonsterZoneIndex !== 0) {
    return;
  }
  
  const trapId = trap.idCarta || trap.id || trap.cardId;
  const trapName = (trap.name || trap.cardName || '').toLowerCase();
  
  const isCallOfTheHaunted =
    host.isExactCard(trap, 'CallOfTheHaunted') ||
    trapId === 'CallOfTheHaunted' ||
    trapId === 'callofthehaunted' ||
    trapId === 'YGOPRO_97077563' ||
    trapId === '97077563' ||
    trapName === 'call of the haunted' ||
    trapName === 'chamado do assombrado';
  
  if (!isCallOfTheHaunted) {
    return;
  }
  
  const monsterZone = trap.equippedToMonsterZoneIndex;
  const playerField = isPlayer1 
    ? (duel as any).player1Field 
    : (duel as any).player2Field;
  
  const monster = playerField?.monsters?.[monsterZone];
  
  if (!monster) {
    logger.info(`📞 [CallOfTheHaunted] Call of the Haunted destruída mas monstro já não está no campo`);
    return;
  }
  
  logger.info(`📞 [CallOfTheHaunted] Call of the Haunted destruída - destruindo monstro ${monster.name || monster.cardName}`);
  
  // Handle equipment destruction before destroying monster
  await host.handleEquipmentDestruction(duelId, duel, isPlayer1, monster);
  
  // Destroy monster - send to owner's graveyard
  const ownerField = host.getOwnerFieldForMonster(duel, monster, isPlayer1);
  if (!ownerField.graveyard) ownerField.graveyard = [];
  ownerField.graveyard.push(monster);
  playerField.monsters[monsterZone] = null;
  
  // Mark monster destroyed for Last Will
  if (!playerField.monsterDestroyedThisTurn) {
    playerField.monsterDestroyedThisTurn = true;
    logger.info(`✅ [CallOfTheHaunted] Monstro destruído no campo - Last Will pode ser ativada`);
  }
  
  // Recalculate United We Stand for both players
  await host.recalculateUnitedWeStandForBothPlayers(duelId, duel);
  
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);
  
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  host.activeDuels.set(duelIdStr, duel);
}
