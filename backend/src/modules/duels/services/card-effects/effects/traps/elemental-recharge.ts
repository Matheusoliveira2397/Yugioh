import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Elemental Recharge / YGOPRO_36586443
 * 
 * Gain 1000 LP for each face-up "Elemental HERO" monster you control.
 */

export async function activateElementalRecharge(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  trapZoneIndex: number,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

  if (!playerField) return false;

  // Count face-up Elemental HERO monsters
  let heroCount = 0;
  if (playerField.monsters && Array.isArray(playerField.monsters)) {
    for (const m of playerField.monsters) {
      if (!m) continue;
      const position = String(m.position || '').toLowerCase();
      const isFaceUp = position === 'attack' || position === 'defense' || position === 'face-up';
      if (isFaceUp && isElementalHeroForRecharge(m)) {
        heroCount++;
      }
    }
  }

  const lpGain = heroCount * 1000;
  logger.info(`💚 [activateElementalRecharge] Elemental Recharge ativada! Ganhando ${lpGain} LP (${heroCount} Elemental HEROes)`);

  // Gain LP
  if (!playerField.lifePoints) playerField.lifePoints = 8000;
  playerField.lifePoints += lpGain;
  logger.info(`✅ [activateElementalRecharge] ${isPlayer1 ? 'Player 1' : 'Player 2'} LP: ${playerField.lifePoints}`);

  // Move Elemental Recharge to graveyard
  if (playerField.spellTrap && playerField.spellTrap[trapZoneIndex]) {
    const trap = playerField.spellTrap[trapZoneIndex];
    if (!playerField.graveyard) {
      playerField.graveyard = [];
    }
    playerField.graveyard.push(trap);
    playerField.spellTrap[trapZoneIndex] = null;
    await host.recalculateMagePowerAtk(duelId, duel, isPlayer1);
  }

  // Update database
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);

  // Update cache
  host.activeDuels.set(duelIdStr, duel);

  return true;
}

function isElementalHeroForRecharge(card: any): boolean {
  if (!card) return false;
  const name = (card.name || card.cardName || '').toLowerCase();
  return name.includes('elemental hero') || name.includes('elemental-hero');
}

export function isElementalRecharge(card: any): boolean {
  if (!card) return false;
  const trapId = card.idCarta || card.id || card.cardId;
  const trapName = (card.name || card.cardName || '').toLowerCase();
  return (
    trapId === 'ElementalRecharge' ||
    trapId === 'elementalrecharge' ||
    trapId === 'YGOPRO_36586443' ||
    trapId === '36586443' ||
    trapName === 'elemental recharge'
  );
}
