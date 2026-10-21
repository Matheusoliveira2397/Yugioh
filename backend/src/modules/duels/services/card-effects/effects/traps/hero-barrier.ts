import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Hero Barrier / YGOPRO_44676200
 * 
 * When an opponent's monster declares an attack: Target that attacking monster;
 * negate the attack. You must control a face-up "Elemental HERO" monster to activate and to resolve this effect.
 */

function isElementalHeroForBarrier(card: any): boolean {
  if (!card) return false;
  const name = (card.name || card.cardName || '').toLowerCase();
  return name.includes('elemental hero') || name.includes('elemental-hero');
}

export async function checkAndActivateHeroBarrier(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  attackerZoneIndex: number,
  attacker: any,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

  // Check if Jinzo is on field
  if (host.isJinzoOnField(duel)) {
    logger.info(`🤖 [checkAndActivateHeroBarrier] Jinzo está no campo - Hero Barrier não pode ser ativada`);
    return false;
  }

  // Check if MirageDragon is blocking traps
  if (host.isMirageDragonBlockingTraps(duel, !isPlayer1)) {
    logger.info(`🐉 [checkAndActivateHeroBarrier] MirageDragon está no campo do atacante - Hero Barrier não pode ser ativada durante Fase de Batalha`);
    return false;
  }

  const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

  if (!opponentField || !opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
    return false;
  }

  // Check if defender has face-up Elemental HERO
  const hasFaceUpHero = opponentField.monsters?.some((m: any) => {
    if (!m) return false;
    const position = String(m.position || '').toLowerCase();
    const isFaceUp = position === 'attack' || position === 'defense' || position === 'face-up';
    return isFaceUp && isElementalHeroForBarrier(m);
  });

  if (!hasFaceUpHero) {
    logger.info(`[checkAndActivateHeroBarrier] Sem Elemental HERO face-up no campo - Hero Barrier não pode ser ativada`);
    return false;
  }

  // Find Hero Barrier that is set (face-down)
  let heroBarrierZoneIndex = -1;
  for (let i = 0; i < opponentField.spellTrap.length; i++) {
    const trap = opponentField.spellTrap[i];
    if (trap && trap !== null) {
      const trapId = trap.idCarta || trap.id || trap.cardId;
      const trapName = (trap.name || trap.cardName || '').toLowerCase();
      const trapPosition = trap.position || 'set';

      const isHeroBarrier =
        host.isExactCard(trap, 'HeroBarrier') ||
        trapId === 'HeroBarrier' ||
        trapId === 'herobarrier' ||
        trapId === 'YGOPRO_44676200' ||
        trapId === '44676200' ||
        trapName === 'hero barrier';

      if (isHeroBarrier && trapPosition === 'set') {
        heroBarrierZoneIndex = i;
        logger.info(`🛡️ [checkAndActivateHeroBarrier] Hero Barrier encontrada na zona ${i} do oponente`);
        break;
      }
    }
  }

  if (heroBarrierZoneIndex === -1) {
    return false;
  }

  logger.info(`💥 [checkAndActivateHeroBarrier] Hero Barrier ativada! Negando ataque`);

  // Move Hero Barrier to graveyard
  const heroBarrier = opponentField.spellTrap[heroBarrierZoneIndex];
  if (heroBarrier) {
    if (!opponentField.graveyard) {
      opponentField.graveyard = [];
    }
    opponentField.graveyard.push(heroBarrier);
    opponentField.spellTrap[heroBarrierZoneIndex] = null;
    logger.info(`✅ [checkAndActivateHeroBarrier] Hero Barrier movida para o cemitério após ativação`);
    await host.recalculateMagePowerAtk(duelId, duel, !isPlayer1);
  }

  // Update database
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);

  // Update cache
  host.activeDuels.set(duelIdStr, duel);

  return true; // Attack was negated
}
