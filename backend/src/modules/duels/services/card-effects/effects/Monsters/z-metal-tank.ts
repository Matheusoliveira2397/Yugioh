/**
 * Z-Metal Tank (YGOPRO_64500000)
 * Union: Equip to Machine +600 ATK/DEF; destroy this instead of equipped.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const Z_METAL_TANK_KEY = 'z-metal-tank';

export const Z_METAL_TANK_CARD_IDS = [
  'ZMetalTank',
  'Z-MetalTank',
  'YGOPRO_64500000',
  '64500000',
] as const;

export const Z_METAL_TANK_CARD_NAMES = [
  'z-metal tank',
  'z metal tank',
  'tanque metal z',
] as const;

export function isZMetalTank(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of Z_METAL_TANK_CARD_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of Z_METAL_TANK_CARD_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('zmetaltank') || nameCompact.includes('tanquemetalz')) {
    return true;
  }
  if (id.includes('64500000')) {
    return true;
  }
  return false;
}

export function isMachineType(card: any): boolean {
  if (!card) return false;
  const race = String(card.race || '').toLowerCase();
  return race.includes('machine') || race.includes('maquina') || race.includes('máquina');
}

export function getZMetalTankBonus(monster: any, playerField: any): { atk: number; def: number } {
  if (!monster || !playerField) return { atk: 0, def: 0 };
  
  const equippedCards = monster.equippedCards || [];
  for (const equipped of equippedCards) {
    if (isZMetalTank(equipped)) {
      return { atk: 600, def: 600 };
    }
  }
  
  return { atk: 0, def: 0 };
}

export async function processZMetalTankProtection(
  duelsService: any,
  duelId: string,
  duel: any,
  isPlayer1: boolean,
  monster: any,
): Promise<boolean> {
  if (!monster) return false;
  
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  const equippedCards = monster.equippedCards || [];
  let zMetalIdx = -1;
  for (let i = 0; i < equippedCards.length; i++) {
    if (isZMetalTank(equippedCards[i])) {
      zMetalIdx = i;
      break;
    }
  }
  
  if (zMetalIdx < 0) return false;
  
  const zMetal = equippedCards.splice(zMetalIdx, 1)[0];
  if (!playerField.graveyard) playerField.graveyard = [];
  playerField.graveyard.push(zMetal);
  
  console.log(`🛡️ [Z-MetalTank] Destruído no lugar do monstro equipado`);
  
  await (duelsService as any).syncDuelState(duelId, duel, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  });
  
  return true;
}
