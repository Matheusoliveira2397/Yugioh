/**
 * A-Assault Core (YGOPRO_30012506)
 * Union LIGHT Machine: equip to LIGHT Machine; unaffected by opp monster effects;
 * destroy this instead; if sent field to GY add 1 other Union from GY to hand
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const A_ASSAULT_CORE_KEY = 'a-assault-core';

export const A_ASSAULT_CORE_CARD_IDS = [
  'AAssaultCore',
  'A-AssaultCore',
  'YGOPRO_30012506',
  '30012506',
] as const;

export const A_ASSAULT_CORE_CARD_NAMES = [
  'a-assault core',
  'a assault core',
  'nucleo de assalto a',
  'núcleo de assalto a',
] as const;

export function isAAssaultCore(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of A_ASSAULT_CORE_CARD_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of A_ASSAULT_CORE_CARD_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('aassaultcore') || nameCompact.includes('nucleodeassaltoa')) {
    return true;
  }
  if (id.includes('30012506')) {
    return true;
  }
  return false;
}

export function isLightMachineType(card: any): boolean {
  if (!card) return false;
  const race = String(card.race || '').toLowerCase();
  const attribute = String(card.attribute || '').toLowerCase();
  const isMachine = race.includes('machine') || race.includes('maquina') || race.includes('máquina');
  const isLight = attribute.includes('light') || attribute.includes('luz');
  return isMachine && isLight;
}

/**
 * Union effect: Equipped monster unaffected by opponent's monster effects.
 */
export function hasAAssaultCoreProtection(monster: any): boolean {
  if (!monster) return false;
  const equippedCards = monster.equippedCards || [];
  for (const equipped of equippedCards) {
    if (isAAssaultCore(equipped)) {
      return true;
    }
  }
  return false;
}

/**
 * Union effect: Destroy this card instead of equipped monster.
 * Called before monster destruction.
 */
export async function processAAssaultCoreProtection(
  duelsService: any,
  duelId: string,
  duel: any,
  isPlayer1: boolean,
  monster: any,
): Promise<boolean> {
  if (!monster) return false;
  
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  const equippedCards = monster.equippedCards || [];
  let coreIdx = -1;
  for (let i = 0; i < equippedCards.length; i++) {
    if (isAAssaultCore(equippedCards[i])) {
      coreIdx = i;
      break;
    }
  }
  
  if (coreIdx < 0) return false;
  
  const core = equippedCards.splice(coreIdx, 1)[0];
  if (!playerField.graveyard) playerField.graveyard = [];
  playerField.graveyard.push(core);
  
  console.log(`🛡️ [A-AssaultCore] Destruído no lugar do monstro equipado`);
  
  await (duelsService as any).syncDuelState(duelId, duel, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  });
  
  return true;
}

/**
 * Trigger effect: When this card is sent from field to GY,
 * add 1 other Union monster from GY to hand.
 */
export function isUnionMonster(card: any): boolean {
  if (!card) return false;
  const text = String(card.desc || card.description || '').toLowerCase();
  return text.includes('union');
}

export async function triggerAAssaultCoreGYEffect(
  duelsService: any,
  duelId: string,
  duel: any,
  isPlayer1: boolean,
): Promise<void> {
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  const graveyard = playerField.graveyard || [];
  
  // Find other Union monsters in GY (not A-Assault Core itself)
  const validTargets = graveyard.filter((card: any) => 
    isUnionMonster(card) && !isAAssaultCore(card)
  );
  
  if (validTargets.length === 0) {
    console.log(`[A-AssaultCore] Nenhum Union encontrado no GY`);
    return;
  }
  
  // For simplicity, take the first valid target
  const targetCard = validTargets[0];
  const targetIdx = graveyard.indexOf(targetCard);
  
  if (targetIdx >= 0) {
    graveyard.splice(targetIdx, 1);
    if (!playerField.hand) playerField.hand = [];
    playerField.hand.push(targetCard);
    
    console.log(`🔄 [A-AssaultCore] Adicionou ${targetCard.name || 'Union'} do GY para a mão`);
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
  }
}
