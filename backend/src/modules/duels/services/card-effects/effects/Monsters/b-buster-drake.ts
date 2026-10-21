/**
 * B-Buster Drake (YGOPRO_77411244)
 * Union: unaffected by opp Spells; destroy instead; 
 * if sent field to GY add 1 Union from Deck to hand
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const B_BUSTER_DRAKE_KEY = 'b-buster-drake';

export const B_BUSTER_DRAKE_CARD_IDS = [
  'BBusterDrake',
  'B-BusterDrake',
  'YGOPRO_77411244',
  '77411244',
] as const;

export const B_BUSTER_DRAKE_CARD_NAMES = [
  'b-buster drake',
  'b buster drake',
  'drake destruidor b',
] as const;

export function isBBusterDrake(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of B_BUSTER_DRAKE_CARD_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of B_BUSTER_DRAKE_CARD_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('bbusterdrake') || nameCompact.includes('drakedestruidorb')) {
    return true;
  }
  if (id.includes('77411244')) {
    return true;
  }
  return false;
}

/**
 * Union effect: Equipped monster unaffected by opponent's Spells.
 */
export function hasBBusterDrakeProtection(monster: any): boolean {
  if (!monster) return false;
  const equippedCards = monster.equippedCards || [];
  for (const equipped of equippedCards) {
    if (isBBusterDrake(equipped)) {
      return true;
    }
  }
  return false;
}

/**
 * Union effect: Destroy this card instead of equipped monster.
 */
export async function processBBusterDrakeProtection(
  duelsService: any,
  duelId: string,
  duel: any,
  isPlayer1: boolean,
  monster: any,
): Promise<boolean> {
  if (!monster) return false;
  
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  const equippedCards = monster.equippedCards || [];
  let drakeIdx = -1;
  for (let i = 0; i < equippedCards.length; i++) {
    if (isBBusterDrake(equippedCards[i])) {
      drakeIdx = i;
      break;
    }
  }
  
  if (drakeIdx < 0) return false;
  
  const drake = equippedCards.splice(drakeIdx, 1)[0];
  if (!playerField.graveyard) playerField.graveyard = [];
  playerField.graveyard.push(drake);
  
  console.log(`🛡️ [B-BusterDrake] Destruído no lugar do monstro equipado`);
  
  await (duelsService as any).syncDuelState(duelId, duel, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  });
  
  return true;
}

/**
 * Trigger effect: When this card is sent from field to GY,
 * add 1 Union monster from Deck to hand.
 */
export function isUnionMonster(card: any): boolean {
  if (!card) return false;
  const text = String(card.desc || card.description || '').toLowerCase();
  return text.includes('union');
}

export async function triggerBBusterDrakeGYEffect(
  duelsService: any,
  duelId: string,
  duel: any,
  isPlayer1: boolean,
): Promise<void> {
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  const deck = playerField.deck || [];
  
  // Find Union monsters in Deck
  const validTargets = deck.filter((card: any) => isUnionMonster(card));
  
  if (validTargets.length === 0) {
    console.log(`[B-BusterDrake] Nenhum Union encontrado no Deck`);
    return;
  }
  
  // For simplicity, take the first valid target
  const targetCard = validTargets[0];
  const targetIdx = deck.indexOf(targetCard);
  
  if (targetIdx >= 0) {
    deck.splice(targetIdx, 1);
    if (!playerField.hand) playerField.hand = [];
    playerField.hand.push(targetCard);
    
    console.log(`🔍 [B-BusterDrake] Adicionou ${targetCard.name || 'Union'} do Deck para a mão`);
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
  }
}
