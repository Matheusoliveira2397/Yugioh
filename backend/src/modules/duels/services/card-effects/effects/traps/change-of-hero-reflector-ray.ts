/**
 * Change of Hero - Reflector Ray (YGOPRO_74095602)
 * When Elemental HERO Fusion destroyed by battle to GY: 
 * damage = Level x 300
 */

import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';
import { DuelResult } from '../../../../entities/duel.entity';

export async function checkAndActivateChangeOfHeroReflectorRay(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  destroyedMonster: any,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  
  if (host.isJinzoOnField(duel)) {
    logger.info(`🤖 [checkAndActivateChangeOfHeroReflectorRay] Jinzo no campo — não pode ser ativada`);
    return false;
  }

  // Check if destroyed monster is an Elemental HERO Fusion
  const monsterName = (destroyedMonster.name || destroyedMonster.cardName || '').toLowerCase();
  const isElementalHero = monsterName.includes('elemental hero') || 
                          monsterName.includes('heroi elemental') ||
                          monsterName.includes('héroe elemental');
  
  const isFusion = String(destroyedMonster.type || '').toLowerCase().includes('fusion') ||
                   String(destroyedMonster.cardType || '').toLowerCase().includes('fusion');
  
  if (!isElementalHero || !isFusion) {
    return false;
  }

  const defenderField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  if (!defenderField?.spellTrap || !Array.isArray(defenderField.spellTrap)) {
    return false;
  }

  let reflectorRayZoneIndex = -1;
  for (let i = 0; i < defenderField.spellTrap.length; i++) {
    const trap = defenderField.spellTrap[i];
    if (!trap || trap === null) continue;
    const pos = trap.position || 'set';
    if (pos !== 'set') continue;
    
    const trapName = (trap.name || trap.cardName || '').toLowerCase();
    const trapId = compactCardKey(trap.idCarta || trap.id || trap.cardId || '');
    
    if (trapName.includes('change of hero') && trapName.includes('reflector ray') || 
        trapId.includes('74095602')) {
      if (host.isNormalTrapBlockedSameTurnSet(duel, trap)) {
        logger.info(`🔄 [checkAndActivateChangeOfHeroReflectorRay] foi colocada neste turno — não pode ativar ainda`);
        return false;
      }
      reflectorRayZoneIndex = i;
      logger.info(`🔄 [checkAndActivateChangeOfHeroReflectorRay] encontrada na zona ${i}`);
      break;
    }
  }

  if (reflectorRayZoneIndex < 0) {
    return false;
  }

  const level = Number(destroyedMonster.level || 0);
  const damage = level * 300;

  logger.info(`✨ [checkAndActivateChangeOfHeroReflectorRay] Ativada! Elemental HERO Fusion Level ${level} destruído; ${damage} de dano ao oponente`);

  // Apply damage to opponent
  if (isPlayer1) {
    duel.player2LifePoints = Math.max(0, (duel.player2LifePoints || 0) - damage);
  } else {
    duel.player1LifePoints = Math.max(0, (duel.player1LifePoints || 0) - damage);
  }

  // Send trap to GY
  const reflectorRayCard = defenderField.spellTrap[reflectorRayZoneIndex];
  if (reflectorRayCard) {
    if (!defenderField.graveyard) defenderField.graveyard = [];
    defenderField.graveyard.push(reflectorRayCard);
    defenderField.spellTrap[reflectorRayZoneIndex] = null;
    await host.recalculateMagePowerAtk(duelId, duel, isPlayer1);
  }

  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
    player1LifePoints: duel.player1LifePoints,
    player2LifePoints: duel.player2LifePoints,
  } as any);

  host.activeDuels.set(duelIdStr, duel);

  if (duel.player1LifePoints <= 0 || duel.player2LifePoints <= 0) {
    const winnerId = duel.player1LifePoints <= 0 ? duel.player2Id : duel.player1Id;
    await host.finishDuel(
      duelIdStr,
      duel.player1LifePoints <= 0 ? DuelResult.PLAYER2_WIN : DuelResult.PLAYER1_WIN,
      winnerId as number,
    );
  }

  return true;
}

function compactCardKey(key: string): string {
  return String(key || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
