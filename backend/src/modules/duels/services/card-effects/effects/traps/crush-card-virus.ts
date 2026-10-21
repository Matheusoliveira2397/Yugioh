/**
 * Crush Card Virus (YGOPRO_57728570)
 * Tribute DARK ATK<=1000; look opp hand+monsters destroy ATK>=1500;
 * opp may destroy up to 3 ATK>=1500 from Deck; no damage until end of next turn after resolve
 */

import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';
import * as Pts from '../spells/player-target-spell.helpers';

export async function checkAndActivateCrushCardVirus(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  
  if (host.isJinzoOnField(duel)) {
    logger.info(`🤖 [checkAndActivateCrushCardVirus] Jinzo no campo — Crush Card Virus não pode ser ativada`);
    return false;
  }

  const activatorField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
  
  if (!activatorField?.spellTrap || !Array.isArray(activatorField.spellTrap)) {
    return false;
  }

  let virusZoneIndex = -1;
  for (let i = 0; i < activatorField.spellTrap.length; i++) {
    const trap = activatorField.spellTrap[i];
    if (!trap || trap === null) continue;
    const pos = trap.position || 'set';
    if (pos !== 'set') continue;
    
    const trapName = (trap.name || trap.cardName || '').toLowerCase();
    const trapId = compactCardKey(trap.idCarta || trap.id || trap.cardId || '');
    
    if (trapName.includes('crush card virus') || trapId.includes('57728570')) {
      if (host.isNormalTrapBlockedSameTurnSet(duel, trap)) {
        logger.info(`🦠 [checkAndActivateCrushCardVirus] Crush Card Virus foi colocada neste turno — não pode ativar ainda`);
        return false;
      }
      virusZoneIndex = i;
      logger.info(`🦠 [checkAndActivateCrushCardVirus] Crush Card Virus encontrada na zona ${i}`);
      break;
    }
  }

  if (virusZoneIndex < 0) {
    return false;
  }

  // Check if we have a DARK monster with ATK <= 1000 to tribute
  const monsterZones = activatorField.monsterZones || [];
  let tributeMonsterIdx = -1;
  for (let i = 0; i < monsterZones.length; i++) {
    const monster = monsterZones[i];
    if (monster && monster !== null) {
      const attribute = String(monster.attribute || '').toLowerCase();
      const isDark = attribute.includes('dark') || attribute.includes('trevas');
      const atk = Number(monster.atk || 0);
      if (isDark && atk <= 1000) {
        tributeMonsterIdx = i;
        break;
      }
    }
  }

  if (tributeMonsterIdx < 0) {
    logger.info(`🦠 [checkAndActivateCrushCardVirus] Nenhum monstro DARK com ATK<=1000 para tributo`);
    return false;
  }

  logger.info(`🦠 [checkAndActivateCrushCardVirus] Ativada! Tributando monstro DARK ATK<=1000`);

  // Tribute the monster
  const tributeMonster = monsterZones[tributeMonsterIdx];
  await host.handleEquipmentDestruction(duelId, duel, isPlayer1, tributeMonster);
  if (!activatorField.graveyard) activatorField.graveyard = [];
  activatorField.graveyard.push(tributeMonster);
  monsterZones[tributeMonsterIdx] = null;

  // Destroy all opponent's monsters with ATK >= 1500
  const oppMonsterZones = opponentField.monsterZones || [];
  for (let i = 0; i < oppMonsterZones.length; i++) {
    const monster = oppMonsterZones[i];
    if (monster && monster !== null) {
      const atk = Number(monster.atk || 0);
      if (atk >= 1500) {
        await host.handleEquipmentDestruction(duelId, duel, !isPlayer1, monster);
        if (!opponentField.graveyard) opponentField.graveyard = [];
        opponentField.graveyard.push(monster);
        oppMonsterZones[i] = null;
        logger.info(`💀 [CrushCardVirus] Destruiu ${monster.name || 'monster'} (ATK ${atk})`);
      }
    }
  }

  // Destroy ATK >= 1500 in opponent's hand
  const oppHand = opponentField.hand || [];
  for (let i = oppHand.length - 1; i >= 0; i--) {
    const card = oppHand[i];
    if (card && card !== null) {
      const atk = Number(card.atk || 0);
      if (atk >= 1500) {
        oppHand.splice(i, 1);
        if (!opponentField.graveyard) opponentField.graveyard = [];
        opponentField.graveyard.push(card);
        logger.info(`💀 [CrushCardVirus] Destruiu ${card.name || 'card'} da mão (ATK ${atk})`);
      }
    }
  }

  // Destroy up to 3 cards from opponent's deck with ATK >= 1500
  const oppDeck = opponentField.deck || [];
  let destroyedFromDeck = 0;
  for (let i = oppDeck.length - 1; i >= 0 && destroyedFromDeck < 3; i--) {
    const card = oppDeck[i];
    if (card && card !== null) {
      const atk = Number(card.atk || 0);
      if (atk >= 1500) {
        oppDeck.splice(i, 1);
        if (!opponentField.graveyard) opponentField.graveyard = [];
        opponentField.graveyard.push(card);
        destroyedFromDeck++;
        logger.info(`💀 [CrushCardVirus] Destruiu ${card.name || 'card'} do deck (ATK ${atk})`);
      }
    }
  }

  // Send Crush Card Virus to GY
  const virusCard = activatorField.spellTrap[virusZoneIndex];
  if (virusCard) {
    if (!activatorField.graveyard) activatorField.graveyard = [];
    activatorField.graveyard.push(virusCard);
    activatorField.spellTrap[virusZoneIndex] = null;
  }

  // No damage until end of next turn (stored in duel state)
  (duel as any).crushCardVirusNoDamageUntilTurn = (duel.turnCounter || 0) + 2;

  await host.recalculateUnitedWeStandForBothPlayers(duelId, duel);
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
    crushCardVirusNoDamageUntilTurn: (duel as any).crushCardVirusNoDamageUntilTurn,
  } as any);

  host.activeDuels.set(duelIdStr, duel);
  return true;
}

function compactCardKey(key: string): string {
  return String(key || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
