/**
 * Shift (YGOPRO_59560625)
 * When opp targets exactly 1 of your monsters for attack or S/T effect: 
 * retarget another of your monsters
 */

import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

export async function checkAndActivateShift(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  targetMonsterZoneIndex: number,
): Promise<{ activated: boolean; newTargetZoneIndex?: number }> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  
  if (host.isJinzoOnField(duel)) {
    logger.info(`🤖 [checkAndActivateShift] Jinzo no campo — Shift não pode ser ativada`);
    return { activated: false };
  }

  const defenderField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  if (!defenderField?.spellTrap || !Array.isArray(defenderField.spellTrap)) {
    return { activated: false };
  }

  let shiftZoneIndex = -1;
  for (let i = 0; i < defenderField.spellTrap.length; i++) {
    const trap = defenderField.spellTrap[i];
    if (!trap || trap === null) continue;
    const pos = trap.position || 'set';
    if (pos !== 'set') continue;
    
    const trapName = (trap.name || trap.cardName || '').toLowerCase();
    const trapId = compactCardKey(trap.idCarta || trap.id || trap.cardId || '');
    
    if (trapName.includes('shift') || trapId.includes('59560625')) {
      if (host.isNormalTrapBlockedSameTurnSet(duel, trap)) {
        logger.info(`🔄 [checkAndActivateShift] Shift foi colocada neste turno — não pode ativar ainda`);
        return { activated: false };
      }
      shiftZoneIndex = i;
      logger.info(`🔄 [checkAndActivateShift] Shift encontrada na zona ${i}`);
      break;
    }
  }

  if (shiftZoneIndex < 0) {
    return { activated: false };
  }

  // Find another monster to retarget to
  const monsterZones = defenderField.monsterZones || [];
  let newTargetZoneIndex = -1;
  for (let i = 0; i < monsterZones.length; i++) {
    if (i !== targetMonsterZoneIndex && monsterZones[i] && monsterZones[i] !== null) {
      newTargetZoneIndex = i;
      break;
    }
  }

  if (newTargetZoneIndex < 0) {
    logger.info(`🔄 [checkAndActivateShift] Nenhum outro monstro disponível para retargeting`);
    return { activated: false };
  }

  logger.info(`🔄 [checkAndActivateShift] Ativada! Redirecionando alvo da zona ${targetMonsterZoneIndex} para zona ${newTargetZoneIndex}`);

  // Send Shift to GY
  const shiftCard = defenderField.spellTrap[shiftZoneIndex];
  if (shiftCard) {
    if (!defenderField.graveyard) defenderField.graveyard = [];
    defenderField.graveyard.push(shiftCard);
    defenderField.spellTrap[shiftZoneIndex] = null;
    await host.recalculateMagePowerAtk(duelId, duel, isPlayer1);
  }

  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);

  host.activeDuels.set(duelIdStr, duel);
  return { activated: true, newTargetZoneIndex };
}

function compactCardKey(key: string): string {
  return String(key || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
