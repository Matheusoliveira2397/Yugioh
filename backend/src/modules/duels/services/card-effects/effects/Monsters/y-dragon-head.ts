/**
 * Y-Dragon Head (YGOPRO_65622692)
 * Union: Equip to Machine +400 ATK/DEF; destroy this instead of equipped.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const Y_DRAGON_HEAD_KEY = 'y-dragon-head';

export const Y_DRAGON_HEAD_CARD_IDS = [
  'YDragonHead',
  'Y-DragonHead',
  'YGOPRO_65622692',
  '65622692',
] as const;

export const Y_DRAGON_HEAD_CARD_NAMES = [
  'y-dragon head',
  'y dragon head',
  'cabeca dragao y',
  'cabeça dragão y',
] as const;

export function isYDragonHead(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of Y_DRAGON_HEAD_CARD_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of Y_DRAGON_HEAD_CARD_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('ydragonhead') || nameCompact.includes('cabecadragaoy')) {
    return true;
  }
  if (id.includes('65622692')) {
    return true;
  }
  return false;
}

export function isMachineType(card: any): boolean {
  if (!card) return false;
  const race = String(card.race || '').toLowerCase();
  return race.includes('machine') || race.includes('maquina') || race.includes('máquina');
}

export function getYDragonHeadBonus(monster: any, playerField: any): { atk: number; def: number } {
  if (!monster || !playerField) return { atk: 0, def: 0 };
  
  const equippedCards = monster.equippedCards || [];
  for (const equipped of equippedCards) {
    if (isYDragonHead(equipped)) {
      return { atk: 400, def: 400 };
    }
  }
  
  return { atk: 0, def: 0 };
}

export async function processYDragonHeadProtection(
  duelsService: any,
  duelId: string,
  duel: any,
  isPlayer1: boolean,
  monster: any,
): Promise<boolean> {
  if (!monster) return false;
  
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  const equippedCards = monster.equippedCards || [];
  let yDragonIdx = -1;
  for (let i = 0; i < equippedCards.length; i++) {
    if (isYDragonHead(equippedCards[i])) {
      yDragonIdx = i;
      break;
    }
  }
  
  if (yDragonIdx < 0) return false;
  
  const yDragon = equippedCards.splice(yDragonIdx, 1)[0];
  if (!playerField.graveyard) playerField.graveyard = [];
  playerField.graveyard.push(yDragon);
  
  console.log(`🛡️ [Y-DragonHead] Destruído no lugar do monstro equipado`);
  
  await (duelsService as any).syncDuelState(duelId, duel, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  });
  
  return true;
}
