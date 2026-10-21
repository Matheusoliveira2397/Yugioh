import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Time Seal / YGOPRO_35316708
 * 
 * Skip the Draw Phase of your opponent's next turn.
 */

export const TIME_SEAL_IDS = [
  'TimeSeal',
  'YGOPRO_35316708',
  '35316708',
] as const;

/**
 * Activate Time Seal to skip opponent's next draw phase
 */
export async function activateTimeSeal(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  trapZoneIndex: number,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
  
  const trap = playerField.spellTrap?.[trapZoneIndex];
  
  if (!trap) {
    return false;
  }
  
  logger.info(`⏰ [TimeSeal] Time Seal ativada! O oponente não poderá comprar na próxima Draw Phase`);
  
  // Set flag on opponent field to skip next draw phase
  opponentField.skipNextDrawPhase = true;
  
  // Move Time Seal to graveyard
  if (!playerField.graveyard) {
    playerField.graveyard = [];
  }
  playerField.graveyard.push(trap);
  playerField.spellTrap[trapZoneIndex] = null;
  
  logger.info(`✅ [TimeSeal] Time Seal movida para o cemitério após ativação`);
  
  // Recalculate Mage Power (spell/trap removed from field)
  await host.recalculateMagePowerAtk(duelId, duel, isPlayer1);
  
  // Update database
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);
  
  // Update cache
  host.activeDuels.set(duelIdStr, duel);
  
  return true;
}
