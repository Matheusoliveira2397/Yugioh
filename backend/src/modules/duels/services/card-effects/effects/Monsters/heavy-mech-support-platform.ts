/**
 * Heavy Mech Support Platform (YGOPRO_23265594)
 * Union: Equip to Machine +500 ATK/DEF; destroy this instead of equipped.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const HEAVY_MECH_SUPPORT_PLATFORM_KEY = 'heavy-mech-support-platform';

export const HEAVY_MECH_SUPPORT_PLATFORM_CARD_IDS = [
  'HeavyMechSupportPlatform',
  'YGOPRO_23265594',
  '23265594',
] as const;

export const HEAVY_MECH_SUPPORT_PLATFORM_CARD_NAMES = [
  'heavy mech support platform',
  'plataforma de suporte mech pesado',
] as const;

export function isHeavyMechSupportPlatform(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of HEAVY_MECH_SUPPORT_PLATFORM_CARD_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of HEAVY_MECH_SUPPORT_PLATFORM_CARD_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('heavymechsupportplatform')) {
    return true;
  }
  if (id.includes('23265594')) {
    return true;
  }
  return false;
}

export function isMachineType(card: any): boolean {
  if (!card) return false;
  const race = String(card.race || '').toLowerCase();
  return race.includes('machine') || race.includes('maquina') || race.includes('máquina');
}

/**
 * Union effect: +500 ATK/DEF to equipped Machine.
 * Applied during ATK calculation.
 */
export function getHeavyMechBonus(monster: any, playerField: any): { atk: number; def: number } {
  if (!monster || !playerField) return { atk: 0, def: 0 };
  
  // Check if monster has Heavy Mech equipped
  const equippedCards = monster.equippedCards || [];
  for (const equipped of equippedCards) {
    if (isHeavyMechSupportPlatform(equipped)) {
      return { atk: 500, def: 500 };
    }
  }
  
  return { atk: 0, def: 0 };
}

/**
 * Union effect: Destroy this card instead of equipped monster.
 * Called before monster destruction.
 */
export async function processHeavyMechProtection(
  duelsService: any,
  duelId: string,
  duel: any,
  isPlayer1: boolean,
  monster: any,
): Promise<boolean> {
  if (!monster) return false;
  
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  // Check if monster has Heavy Mech equipped
  const equippedCards = monster.equippedCards || [];
  let heavyMechIdx = -1;
  for (let i = 0; i < equippedCards.length; i++) {
    if (isHeavyMechSupportPlatform(equippedCards[i])) {
      heavyMechIdx = i;
      break;
    }
  }
  
  if (heavyMechIdx < 0) return false;
  
  // Remove Heavy Mech and send to GY
  const heavyMech = equippedCards.splice(heavyMechIdx, 1)[0];
  if (!playerField.graveyard) playerField.graveyard = [];
  playerField.graveyard.push(heavyMech);
  
  console.log(`🛡️ [HeavyMech] Destruído no lugar do monstro equipado`);
  
  await (duelsService as any).syncDuelState(duelId, duel, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  });
  
  return true; // Prevented destruction
}
