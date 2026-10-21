import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Hero Blast / YGOPRO_37412656
 * 
 * Target 1 Normal Monster "Elemental HERO" monster in your GY; add it to your hand,
 * then if your opponent controls a monster with ATK less than or equal to that monster's ATK,
 * you can destroy 1 of those monsters.
 */

export async function activateHeroBlast(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  trapZoneIndex: number,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

  if (!playerField) return false;

  logger.info(`🦸 [activateHeroBlast] Hero Blast ativada!`);

  // Move Hero Blast to graveyard
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

  return true; // Caller will handle target selection
}

function isElementalHeroForBlast(card: any): boolean {
  if (!card) return false;
  const name = (card.name || card.cardName || '').toLowerCase();
  return name.includes('elemental hero') || name.includes('elemental-hero');
}

function isNormalMonster(card: any): boolean {
  if (!card) return false;
  const tipo = (card.tipo || card.type || '').toLowerCase();
  return tipo.includes('normal') && !tipo.includes('effect');
}

export function listNormalElementalHeroInGraveyard(
  graveyard: any[] | undefined,
): Array<{ card: any; index: number }> {
  if (!Array.isArray(graveyard)) return [];
  const out: Array<{ card: any; index: number }> = [];
  for (let i = 0; i < graveyard.length; i++) {
    const c = graveyard[i];
    if (!c) continue;
    if (isElementalHeroForBlast(c) && isNormalMonster(c)) {
      out.push({ card: c, index: i });
    }
  }
  return out;
}

export function listOpponentMonstersAtOrBelowAtk(
  opponentField: any,
  maxAtk: number,
): Array<{ card: any; zoneIndex: number }> {
  if (!opponentField?.monsters || !Array.isArray(opponentField.monsters)) return [];
  const out: Array<{ card: any; zoneIndex: number }> = [];
  for (let i = 0; i < opponentField.monsters.length; i++) {
    const m = opponentField.monsters[i];
    if (!m) continue;
    const atk = m.atk || 0;
    if (atk <= maxAtk) {
      out.push({ card: m, zoneIndex: i });
    }
  }
  return out;
}

export function isHeroBlast(card: any): boolean {
  if (!card) return false;
  const trapId = card.idCarta || card.id || card.cardId;
  const trapName = (card.name || card.cardName || '').toLowerCase();
  return (
    trapId === 'HeroBlast' ||
    trapId === 'heroblast' ||
    trapId === 'YGOPRO_37412656' ||
    trapId === '37412656' ||
    trapName === 'hero blast'
  );
}
