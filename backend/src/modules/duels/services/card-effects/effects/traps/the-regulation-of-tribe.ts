/**
 * The Regulation of Tribe (YGOPRO_296499)
 * Declare Type; that Type cannot attack; 
 * each your Standby Tribute 1 or destroy this
 */

import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

export async function checkAndActivateRegulationOfTribe(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  declaredType: string,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  
  if (host.isJinzoOnField(duel)) {
    logger.info(`🤖 [checkAndActivateRegulationOfTribe] Jinzo no campo — Regulation não pode ser ativada`);
    return false;
  }

  const activatorField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  if (!activatorField?.spellTrap || !Array.isArray(activatorField.spellTrap)) {
    return false;
  }

  let regulationZoneIndex = -1;
  for (let i = 0; i < activatorField.spellTrap.length; i++) {
    const trap = activatorField.spellTrap[i];
    if (!trap || trap === null) continue;
    const pos = trap.position || 'set';
    if (pos !== 'set') continue;
    
    const trapName = (trap.name || trap.cardName || '').toLowerCase();
    const trapId = compactCardKey(trap.idCarta || trap.id || trap.cardId || '');
    
    if (trapName.includes('regulation of tribe') || trapId.includes('296499')) {
      if (host.isNormalTrapBlockedSameTurnSet(duel, trap)) {
        logger.info(`⚖️ [checkAndActivateRegulationOfTribe] Regulation foi colocada neste turno — não pode ativar ainda`);
        return false;
      }
      regulationZoneIndex = i;
      logger.info(`⚖️ [checkAndActivateRegulationOfTribe] Regulation encontrada na zona ${i}`);
      break;
    }
  }

  if (regulationZoneIndex < 0) {
    return false;
  }

  logger.info(`⚖️ [checkAndActivateRegulationOfTribe] Ativada! Tipo declarado: ${declaredType}`);

  // Flip the trap face-up and store the declared type
  const regulationCard = activatorField.spellTrap[regulationZoneIndex];
  if (regulationCard) {
    regulationCard.position = 'face-up';
    regulationCard.declaredType = declaredType;
    regulationCard.regulationActivatedTurn = duel.turnCounter || 0;
  }

  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);

  host.activeDuels.set(duelIdStr, duel);
  return true;
}

/**
 * Check if a monster is affected by The Regulation of Tribe
 */
export function isMonsterBlockedByRegulation(
  monster: any,
  playerField: any,
): boolean {
  if (!monster || !playerField) return false;
  
  const spellTrap = playerField.spellTrap || [];
  for (const card of spellTrap) {
    if (card && card !== null) {
      const trapName = (card.name || card.cardName || '').toLowerCase();
      const trapId = compactCardKey(card.idCarta || card.id || card.cardId || '');
      
      if ((trapName.includes('regulation of tribe') || trapId.includes('296499')) && 
          card.position === 'face-up' && 
          card.declaredType) {
        const monsterRace = String(monster.race || '').toLowerCase();
        const declaredType = String(card.declaredType || '').toLowerCase();
        
        if (monsterRace.includes(declaredType) || declaredType.includes(monsterRace)) {
          return true;
        }
      }
    }
  }
  
  return false;
}

/**
 * During Standby Phase: tribute 1 monster or destroy this card
 */
export async function maintainRegulationOfTribe(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
): Promise<void> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  const spellTrap = playerField.spellTrap || [];
  for (let i = 0; i < spellTrap.length; i++) {
    const card = spellTrap[i];
    if (card && card !== null) {
      const trapName = (card.name || card.cardName || '').toLowerCase();
      const trapId = compactCardKey(card.idCarta || card.id || card.cardId || '');
      
      if ((trapName.includes('regulation of tribe') || trapId.includes('296499')) && 
          card.position === 'face-up') {
        
        // Try to tribute a monster
        const monsterZones = playerField.monsterZones || [];
        let tributedMonster = false;
        
        for (let j = 0; j < monsterZones.length; j++) {
          if (monsterZones[j] && monsterZones[j] !== null) {
            const monster = monsterZones[j];
            await host.handleEquipmentDestruction(duelId, duel, isPlayer1, monster);
            if (!playerField.graveyard) playerField.graveyard = [];
            playerField.graveyard.push(monster);
            monsterZones[j] = null;
            logger.info(`⚖️ [maintainRegulationOfTribe] Tributou ${monster.name || 'monstro'} para manter Regulation`);
            tributedMonster = true;
            break;
          }
        }
        
        // If no monster was tributed, destroy the Regulation
        if (!tributedMonster) {
          if (!playerField.graveyard) playerField.graveyard = [];
          playerField.graveyard.push(card);
          spellTrap[i] = null;
          logger.info(`⚖️ [maintainRegulationOfTribe] Regulation destruída (nenhum monstro para tributar)`);
        }
      }
    }
  }
  
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);
  
  host.activeDuels.set(duelIdStr, duel);
}

function compactCardKey(key: string): string {
  return String(key || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
