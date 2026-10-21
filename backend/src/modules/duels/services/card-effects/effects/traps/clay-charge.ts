/**
 * Clay Charge (YGOPRO_22479888)
 * When Elemental HERO Clayman targeted for attack: 
 * destroy attacker and Clayman; 800 damage to opp
 */

import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';
import { DuelResult } from '../../../../entities/duel.entity';

export async function checkAndActivateClayCharge(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  attackerZoneIndex: number,
  attacker: any,
  defenderZoneIndex: number,
  defender: any,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  
  if (host.isJinzoOnField(duel)) {
    logger.info(`🤖 [checkAndActivateClayCharge] Jinzo no campo — Clay Charge não pode ser ativada`);
    return false;
  }

  // Check if defender is Elemental HERO Clayman
  const defenderName = (defender.name || defender.cardName || '').toLowerCase();
  const defenderId = compactCardKey(defender.idCarta || defender.id || defender.cardId || '');
  
  const isClayman = defenderName.includes('elemental hero clayman') || 
                    defenderName.includes('heroi elemental clayman') ||
                    defenderId.includes('claywarrior') ||
                    defenderId.includes('clayman');
  
  if (!isClayman) {
    return false;
  }

  const defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
  const attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  if (!defenderField?.spellTrap || !Array.isArray(defenderField.spellTrap)) {
    return false;
  }

  let clayChargeZoneIndex = -1;
  for (let i = 0; i < defenderField.spellTrap.length; i++) {
    const trap = defenderField.spellTrap[i];
    if (!trap || trap === null) continue;
    const pos = trap.position || 'set';
    if (pos !== 'set') continue;
    
    const trapName = (trap.name || trap.cardName || '').toLowerCase();
    const trapId = compactCardKey(trap.idCarta || trap.id || trap.cardId || '');
    
    if (trapName.includes('clay charge') || trapId.includes('22479888')) {
      if (host.isNormalTrapBlockedSameTurnSet(duel, trap)) {
        logger.info(`🪨 [checkAndActivateClayCharge] Clay Charge foi colocada neste turno — não pode ativar ainda`);
        return false;
      }
      clayChargeZoneIndex = i;
      logger.info(`🪨 [checkAndActivateClayCharge] Clay Charge encontrada na zona ${i}`);
      break;
    }
  }

  if (clayChargeZoneIndex < 0) {
    return false;
  }

  logger.info(`💥 [checkAndActivateClayCharge] Ativada! Destruindo atacante e Clayman; 800 de dano ao oponente`);

  // Destroy the attacker
  await host.handleEquipmentDestruction(duelId, duel, isPlayer1, attacker);
  const ownerFieldAttacker = host.getOwnerFieldForMonster(duel, attacker, isPlayer1);
  if (!ownerFieldAttacker.graveyard) ownerFieldAttacker.graveyard = [];
  ownerFieldAttacker.graveyard.push(attacker);
  attackerField.monsters[attackerZoneIndex] = null;

  // Destroy Clayman
  await host.handleEquipmentDestruction(duelId, duel, !isPlayer1, defender);
  if (!defenderField.graveyard) defenderField.graveyard = [];
  defenderField.graveyard.push(defender);
  defenderField.monsters[defenderZoneIndex] = null;

  // 800 damage to opponent (attacker's controller)
  if (isPlayer1) {
    duel.player1LifePoints = Math.max(0, (duel.player1LifePoints || 0) - 800);
  } else {
    duel.player2LifePoints = Math.max(0, (duel.player2LifePoints || 0) - 800);
  }

  // Send Clay Charge to GY
  const clayChargeCard = defenderField.spellTrap[clayChargeZoneIndex];
  if (clayChargeCard) {
    if (!defenderField.graveyard) defenderField.graveyard = [];
    defenderField.graveyard.push(clayChargeCard);
    defenderField.spellTrap[clayChargeZoneIndex] = null;
    await host.recalculateMagePowerAtk(duelId, duel, !isPlayer1);
  }

  await host.recalculateUnitedWeStandForBothPlayers(duelId, duel);
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
