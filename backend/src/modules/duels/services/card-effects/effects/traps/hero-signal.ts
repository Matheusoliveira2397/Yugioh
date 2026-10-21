import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Hero Signal / YGOPRO_22020907
 * 
 * When a monster you control is destroyed by battle and sent to the GY:
 * Special Summon 1 Level 4 or lower "Elemental HERO" monster from your hand or Deck.
 */

export async function checkAndActivateHeroSignal(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  destroyedMonster: any,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

  // Check if Jinzo is on field
  if (host.isJinzoOnField(duel)) {
    logger.info(`🤖 [checkAndActivateHeroSignal] Jinzo está no campo - Hero Signal não pode ser ativada`);
    return false;
  }

  // Check if MirageDragon is blocking traps
  if (host.isMirageDragonBlockingTraps(duel, isPlayer1)) {
    logger.info(`🐉 [checkAndActivateHeroSignal] MirageDragon está no campo - Hero Signal não pode ser ativada durante Fase de Batalha`);
    return false;
  }

  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

  if (!playerField || !playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
    return false;
  }

  // Find Hero Signal that is set (face-down)
  let heroSignalZoneIndex = -1;
  for (let i = 0; i < playerField.spellTrap.length; i++) {
    const trap = playerField.spellTrap[i];
    if (trap && trap !== null) {
      const trapId = trap.idCarta || trap.id || trap.cardId;
      const trapName = (trap.name || trap.cardName || '').toLowerCase();
      const trapPosition = trap.position || 'set';

      const isHeroSignal =
        host.isExactCard(trap, 'HeroSignal') ||
        trapId === 'HeroSignal' ||
        trapId === 'herosignal' ||
        trapId === 'YGOPRO_22020907' ||
        trapId === '22020907' ||
        trapName === 'hero signal';

      if (isHeroSignal && trapPosition === 'set') {
        heroSignalZoneIndex = i;
        logger.info(`🦸 [checkAndActivateHeroSignal] Hero Signal encontrada na zona ${i}`);
        break;
      }
    }
  }

  if (heroSignalZoneIndex === -1) {
    return false;
  }

  logger.info(`💥 [checkAndActivateHeroSignal] Hero Signal ativada após ${destroyedMonster.name || destroyedMonster.cardName} ser destruído`);

  // Move Hero Signal to graveyard
  const heroSignal = playerField.spellTrap[heroSignalZoneIndex];
  if (heroSignal) {
    if (!playerField.graveyard) {
      playerField.graveyard = [];
    }
    playerField.graveyard.push(heroSignal);
    playerField.spellTrap[heroSignalZoneIndex] = null;
    logger.info(`✅ [checkAndActivateHeroSignal] Hero Signal movida para o cemitério após ativação`);
    await host.recalculateMagePowerAtk(duelId, duel, isPlayer1);
  }

  // Update database
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);

  // Update cache
  host.activeDuels.set(duelIdStr, duel);

  return true; // Hero Signal was activated, caller will handle SS choice
}

function isElementalHeroForSignal(card: any): boolean {
  if (!card) return false;
  const name = (card.name || card.cardName || '').toLowerCase();
  return name.includes('elemental hero') || name.includes('elemental-hero');
}

export function listLevel4OrLowerElementalHeroInHandOrDeck(
  hand: any[] | undefined,
  deck: any[] | undefined,
): Array<{ source: 'hand' | 'deck'; index: number; card: any }> {
  const out: Array<{ source: 'hand' | 'deck'; index: number; card: any }> = [];
  const scan = (arr: any[] | undefined, source: 'hand' | 'deck') => {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (!c) continue;
      if (!isElementalHeroForSignal(c)) continue;
      const level = Number(c.level) || 0;
      if (level >= 1 && level <= 4) {
        out.push({ source, index: i, card: c });
      }
    }
  };
  scan(hand, 'hand');
  scan(deck, 'deck');
  return out;
}
