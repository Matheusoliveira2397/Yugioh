/**
 * Keeper of the Shrine (YGOPRO_66752837)
 * - Counts as 2 tributes for Dragon-Type monster
 * - When face-up Dragon leaves field by battle/effect: SS this card from hand/GY
 * - When Normal Summoning Dragon: add 1 Dragon Normal Monster from GY to hand
 * OPT for each effect.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const KEEPER_OF_THE_SHRINE_KEY = 'keeper-of-the-shrine';

export const KEEPER_OF_THE_SHRINE_CARD_IDS = [
  'KeeperoftheShrine',
  'KeeperOfTheShrine',
  'YGOPRO_66752837',
  '66752837',
] as const;

export const KEEPER_OF_THE_SHRINE_CARD_NAMES = [
  'keeper of the shrine',
  'guardiao do santuario',
  'guardião do santuário',
] as const;

export function isKeeperOfTheShrine(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of KEEPER_OF_THE_SHRINE_CARD_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of KEEPER_OF_THE_SHRINE_CARD_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('keeperoftheshrine') || nameCompact.includes('guardiaodosantuario')) {
    return true;
  }
  if (id.includes('66752837')) {
    return true;
  }
  return false;
}

export function isDragonType(card: any): boolean {
  if (!card) return false;
  const race = String(card.race || '').toLowerCase();
  return race.includes('dragon') || race.includes('dragao') || race.includes('dragão');
}

/**
 * Keeper counts as 2 tributes when tributing for Dragon-Type.
 * This is checked during tribute summon logic.
 */
export function keeperCountsAsDoubleTribute(tributeCard: any, tributeSummonCard: any): boolean {
  return isKeeperOfTheShrine(tributeCard) && isDragonType(tributeSummonCard);
}

/**
 * When face-up Dragon leaves field by battle/effect: SS Keeper from hand/GY (OPT).
 * Called from destroy/removal logic.
 */
export async function processKeeperOfTheShrineSpecialSummon(
  duelsService: any,
  duelId: string,
  duel: any,
  isPlayer1: boolean,
  destroyedDragon: any,
): Promise<void> {
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  // Check if already used OPT
  if (playerField.keeperOfTheShrineUsedThisTurn) {
    return;
  }
  
  // Check if destroyed was face-up Dragon
  if (!destroyedDragon) return;
  const wasFaceUp = destroyedDragon.position === 'attack' || destroyedDragon.position === 'defense';
  if (!wasFaceUp || !isDragonType(destroyedDragon)) return;
  
  // Try to find Keeper in hand first
  let keeperCard: any = null;
  let fromHand = false;
  let fromGY = false;
  let handIndex = -1;
  let gyIndex = -1;
  
  if (playerField.hand) {
    for (let i = 0; i < playerField.hand.length; i++) {
      if (isKeeperOfTheShrine(playerField.hand[i])) {
        keeperCard = playerField.hand[i];
        handIndex = i;
        fromHand = true;
        break;
      }
    }
  }
  
  // If not in hand, try GY
  if (!keeperCard && playerField.graveyard) {
    for (let i = 0; i < playerField.graveyard.length; i++) {
      if (isKeeperOfTheShrine(playerField.graveyard[i])) {
        keeperCard = playerField.graveyard[i];
        gyIndex = i;
        fromGY = true;
        break;
      }
    }
  }
  
  if (!keeperCard) return;
  
  // Find empty zone
  if (!playerField.monsters) playerField.monsters = [null, null, null, null, null];
  let emptyZ = -1;
  for (let i = 0; i < playerField.monsters.length; i++) {
    if (!playerField.monsters[i]) {
      emptyZ = i;
      break;
    }
  }
  
  if (emptyZ < 0) return;
  
  // Remove from source
  if (fromHand) {
    playerField.hand.splice(handIndex, 1);
  } else if (fromGY) {
    playerField.graveyard.splice(gyIndex, 1);
  }
  
  // Special Summon
  const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;
  playerField.monsters[emptyZ] = {
    ...keeperCard,
    position: 'attack',
    summonedTurnNumber: currentTurnCounter,
    summonedByPlayer: duel.currentTurn,
    positionChangedThisTurn: false,
    attackedThisTurn: false,
    attacksThisTurn: 0,
    specialSummoned: true,
  };
  
  playerField.keeperOfTheShrineUsedThisTurn = true;
  
  console.log(`✨ [KeeperOfTheShrine] SS from ${fromHand ? 'hand' : 'GY'} após Dragon destruído`);
  
  await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
  await (duelsService as any).syncDuelState(duelId, duel, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  });
}

/**
 * When Normal Summoning Dragon: add 1 Dragon Normal Monster from GY to hand (OPT).
 * Called after successful Normal Summon.
 */
export async function processKeeperOfTheShrineAddDragon(
  duelsService: any,
  duelId: string,
  duel: any,
  isPlayer1: boolean,
  summonedDragon: any,
): Promise<void> {
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  // Check if already used OPT
  if (playerField.keeperAddDragonUsedThisTurn) {
    return;
  }
  
  // Check if summoned was Dragon
  if (!isDragonType(summonedDragon)) return;
  
  // Find Dragon Normal Monster in GY
  if (!playerField.graveyard) return;
  let targetIdx = -1;
  for (let i = 0; i < playerField.graveyard.length; i++) {
    const c = playerField.graveyard[i];
    if (!c) continue;
    const isMonster = String(c.type || c.cardType).toLowerCase().includes('monster');
    const monsterType = String(c.monsterType || c.monster_type || '').toLowerCase();
    const isNormal = monsterType === 'normal';
    if (isMonster && isNormal && isDragonType(c)) {
      targetIdx = i;
      break;
    }
  }
  
  if (targetIdx < 0) return;
  
  // Add to hand
  const card = playerField.graveyard.splice(targetIdx, 1)[0];
  if (!playerField.hand) playerField.hand = [];
  playerField.hand.push(card);
  
  playerField.keeperAddDragonUsedThisTurn = true;
  
  console.log(`✨ [KeeperOfTheShrine] Adicionou ${card.name || card.cardName} do GY à mão`);
  
  await (duelsService as any).syncDuelState(duelId, duel, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  });
}
