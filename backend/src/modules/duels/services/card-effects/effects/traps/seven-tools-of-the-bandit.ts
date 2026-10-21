import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Seven Tools of the Bandit / YGOPRO_3819470
 * 
 * When a Trap Card is activated: Pay 1000 LP; negate the activation, and if you do, destroy it.
 */

export async function checkAndActivateSevenTools(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  activatedTrapCard: any,
  activatedTrapOwner: boolean,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

  // Check if Jinzo is on field
  if (host.isJinzoOnField(duel)) {
    logger.info(`🤖 [checkAndActivateSevenTools] Jinzo está no campo - Seven Tools não pode ser ativada`);
    return false;
  }

  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

  if (!playerField || !playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
    return false;
  }

  // Check if player has enough LP to pay 1000
  const currentLP = playerField.lifePoints || 8000;
  if (currentLP < 1000) {
    logger.info(`[checkAndActivateSevenTools] LP insuficiente (${currentLP}) para ativar Seven Tools`);
    return false;
  }

  // Find Seven Tools that is set (face-down)
  let sevenToolsZoneIndex = -1;
  for (let i = 0; i < playerField.spellTrap.length; i++) {
    const trap = playerField.spellTrap[i];
    if (trap && trap !== null) {
      const trapId = trap.idCarta || trap.id || trap.cardId;
      const trapName = (trap.name || trap.cardName || '').toLowerCase();
      const trapPosition = trap.position || 'set';

      const isSevenTools =
        host.isExactCard(trap, 'SevenToolsOfTheBandit') ||
        trapId === 'SevenToolsOfTheBandit' ||
        trapId === 'seventoolsofthebandit' ||
        trapId === 'YGOPRO_3819470' ||
        trapId === '3819470' ||
        trapName === 'seven tools of the bandit';

      if (isSevenTools && trapPosition === 'set') {
        sevenToolsZoneIndex = i;
        logger.info(`🔧 [checkAndActivateSevenTools] Seven Tools encontrada na zona ${i}`);
        break;
      }
    }
  }

  if (sevenToolsZoneIndex === -1) {
    return false;
  }

  logger.info(`💥 [checkAndActivateSevenTools] Seven Tools ativada! Negando ${activatedTrapCard.name || activatedTrapCard.cardName}`);

  // Pay 1000 LP
  playerField.lifePoints = Math.max(0, currentLP - 1000);
  logger.info(`💔 [checkAndActivateSevenTools] ${isPlayer1 ? 'Player 1' : 'Player 2'} pagou 1000 LP. LP: ${playerField.lifePoints}`);

  // Move Seven Tools to graveyard
  const sevenTools = playerField.spellTrap[sevenToolsZoneIndex];
  if (sevenTools) {
    if (!playerField.graveyard) {
      playerField.graveyard = [];
    }
    playerField.graveyard.push(sevenTools);
    playerField.spellTrap[sevenToolsZoneIndex] = null;
    logger.info(`✅ [checkAndActivateSevenTools] Seven Tools movida para o cemitério após ativação`);
    await host.recalculateMagePowerAtk(duelId, duel, isPlayer1);
  }

  // Update database
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);

  // Update cache
  host.activeDuels.set(duelIdStr, duel);

  return true; // Trap was negated
}
