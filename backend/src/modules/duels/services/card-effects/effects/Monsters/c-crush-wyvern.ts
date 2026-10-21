/**
 * C-Crush Wyvern (YGOPRO_3405259)
 * Union: unaffected by opp Traps; destroy instead; 
 * if sent field to GY SS 1 Union from hand
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const C_CRUSH_WYVERN_KEY = 'c-crush-wyvern';

export const C_CRUSH_WYVERN_CARD_IDS = [
  'CCrushWyvern',
  'C-CrushWyvern',
  'YGOPRO_3405259',
  '3405259',
] as const;

export const C_CRUSH_WYVERN_CARD_NAMES = [
  'c-crush wyvern',
  'c crush wyvern',
  'serpe esmagadora c',
] as const;

export function isCCrushWyvern(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of C_CRUSH_WYVERN_CARD_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of C_CRUSH_WYVERN_CARD_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('ccrushwyvern') || nameCompact.includes('serpeesmagadorac')) {
    return true;
  }
  if (id.includes('3405259')) {
    return true;
  }
  return false;
}

/**
 * Union effect: Equipped monster unaffected by opponent's Traps.
 */
export function hasCCrushWyvernProtection(monster: any): boolean {
  if (!monster) return false;
  const equippedCards = monster.equippedCards || [];
  for (const equipped of equippedCards) {
    if (isCCrushWyvern(equipped)) {
      return true;
    }
  }
  return false;
}

/**
 * Union effect: Destroy this card instead of equipped monster.
 */
export async function processCCrushWyvernProtection(
  duelsService: any,
  duelId: string,
  duel: any,
  isPlayer1: boolean,
  monster: any,
): Promise<boolean> {
  if (!monster) return false;
  
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  const equippedCards = monster.equippedCards || [];
  let wyvernIdx = -1;
  for (let i = 0; i < equippedCards.length; i++) {
    if (isCCrushWyvern(equippedCards[i])) {
      wyvernIdx = i;
      break;
    }
  }
  
  if (wyvernIdx < 0) return false;
  
  const wyvern = equippedCards.splice(wyvernIdx, 1)[0];
  if (!playerField.graveyard) playerField.graveyard = [];
  playerField.graveyard.push(wyvern);
  
  console.log(`🛡️ [C-CrushWyvern] Destruído no lugar do monstro equipado`);
  
  await (duelsService as any).syncDuelState(duelId, duel, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  });
  
  return true;
}

/**
 * Trigger effect: When this card is sent from field to GY,
 * Special Summon 1 Union monster from hand.
 */
export function isUnionMonster(card: any): boolean {
  if (!card) return false;
  const text = String(card.desc || card.description || '').toLowerCase();
  return text.includes('union');
}

export async function triggerCCrushWyvernGYEffect(
  duelsService: any,
  duelId: string,
  duel: any,
  isPlayer1: boolean,
): Promise<void> {
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  const hand = playerField.hand || [];
  
  // Find Union monsters in hand
  const validTargets = hand.filter((card: any) => isUnionMonster(card));
  
  if (validTargets.length === 0) {
    console.log(`[C-CrushWyvern] Nenhum Union encontrado na mão`);
    return;
  }
  
  // Check for available monster zone
  const monsterZones = playerField.monsterZones || [];
  const availableZone = monsterZones.findIndex((zone: any) => !zone);
  
  if (availableZone < 0) {
    console.log(`[C-CrushWyvern] Nenhuma zona de monstro disponível`);
    return;
  }
  
  // For simplicity, summon the first valid target
  const targetCard = validTargets[0];
  const targetIdx = hand.indexOf(targetCard);
  
  if (targetIdx >= 0) {
    hand.splice(targetIdx, 1);
    monsterZones[availableZone] = {
      ...targetCard,
      position: 'attack',
      equippedCards: [],
    };
    
    console.log(`✨ [C-CrushWyvern] Invocou ${targetCard.name || 'Union'} da mão`);
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
  }
}
