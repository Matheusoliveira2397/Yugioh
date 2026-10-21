import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Interdimensional Matter Transporter / YGOPRO_36261276
 * 
 * Target 1 face-up monster you control; banish it until the End Phase.
 */

export const INTERDIMENSIONAL_MATTER_TRANSPORTER_IDS = [
  'InterdimensionalMatterTransporter',
  'YGOPRO_36261276',
  '36261276',
] as const;

/**
 * Return banished monsters at end phase
 */
export async function returnInterdimensionalMonsters(
  host: any,
  duelId: string | number,
  duel: Duel,
): Promise<void> {
  const player1Field = (duel as any).player1Field;
  const player2Field = (duel as any).player2Field;
  
  let updated = false;
  
  // Check player 1's banished monsters
  if (player1Field?.interdimensionalBanished && Array.isArray(player1Field.interdimensionalBanished)) {
    for (const banishedData of player1Field.interdimensionalBanished) {
      const { monster, originalZone, originalPosition } = banishedData;
      
      // Try to return to original zone if empty
      if (player1Field.monsters[originalZone] === null || player1Field.monsters[originalZone] === undefined) {
        player1Field.monsters[originalZone] = monster;
        logger.info(`🌀 [InterdimensionalMatterTransporter] Retornando ${monster.name || monster.cardName} para zona ${originalZone} de Player 1`);
      } else {
        // If zone is occupied, send to graveyard
        if (!player1Field.graveyard) player1Field.graveyard = [];
        player1Field.graveyard.push(monster);
        logger.info(`🌀 [InterdimensionalMatterTransporter] Zona ${originalZone} ocupada - enviando ${monster.name || monster.cardName} ao cemitério`);
      }
      updated = true;
    }
    player1Field.interdimensionalBanished = [];
  }
  
  // Check player 2's banished monsters
  if (player2Field?.interdimensionalBanished && Array.isArray(player2Field.interdimensionalBanished)) {
    for (const banishedData of player2Field.interdimensionalBanished) {
      const { monster, originalZone, originalPosition } = banishedData;
      
      // Try to return to original zone if empty
      if (player2Field.monsters[originalZone] === null || player2Field.monsters[originalZone] === undefined) {
        player2Field.monsters[originalZone] = monster;
        logger.info(`🌀 [InterdimensionalMatterTransporter] Retornando ${monster.name || monster.cardName} para zona ${originalZone} de Player 2`);
      } else {
        // If zone is occupied, send to graveyard
        if (!player2Field.graveyard) player2Field.graveyard = [];
        player2Field.graveyard.push(monster);
        logger.info(`🌀 [InterdimensionalMatterTransporter] Zona ${originalZone} ocupada - enviando ${monster.name || monster.cardName} ao cemitério`);
      }
      updated = true;
    }
    player2Field.interdimensionalBanished = [];
  }
  
  if (updated) {
    await host.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    host.activeDuels.set(duelIdStr, duel);
  }
}
