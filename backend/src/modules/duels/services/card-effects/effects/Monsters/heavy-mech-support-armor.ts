/**
 * Heavy Mech Support Armor (YGOPRO_39890958)
 * NS: SS Union from GY; Union on Machine: cannot be targeted; destroy instead
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const HEAVY_MECH_SUPPORT_ARMOR_KEY = 'heavy-mech-support-armor';

export const HEAVY_MECH_SUPPORT_ARMOR_CARD_IDS = [
  'HeavyMechSupportArmor',
  'YGOPRO_39890958',
  '39890958',
] as const;

export const HEAVY_MECH_SUPPORT_ARMOR_CARD_NAMES = [
  'heavy mech support armor',
  'armadura de suporte mech pesado',
] as const;

export function isHeavyMechSupportArmor(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of HEAVY_MECH_SUPPORT_ARMOR_CARD_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of HEAVY_MECH_SUPPORT_ARMOR_CARD_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('heavymechsupportarmor') || nameCompact.includes('armaduradesuportemechpesado')) {
    return true;
  }
  if (id.includes('39890958')) {
    return true;
  }
  return false;
}

export function isUnionMonster(card: any): boolean {
  if (!card) return false;
  const text = String(card.desc || card.description || '').toLowerCase();
  return text.includes('union');
}

export function isMachineType(card: any): boolean {
  if (!card) return false;
  const race = String(card.race || '').toLowerCase();
  return race.includes('machine') || race.includes('maquina') || race.includes('máquina');
}

/**
 * On Normal Summon: Special Summon 1 Union monster from GY.
 */
export async function triggerHeavyMechArmorNSEffect(
  duelsService: any,
  duelId: string,
  duel: any,
  isPlayer1: boolean,
): Promise<void> {
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  const graveyard = playerField.graveyard || [];
  
  // Find Union monsters in GY
  const validTargets = graveyard.filter((card: any) => isUnionMonster(card));
  
  if (validTargets.length === 0) {
    console.log(`[HeavyMechArmor] Nenhum Union encontrado no GY`);
    return;
  }
  
  // Check for available monster zone
  const monsterZones = playerField.monsterZones || [];
  const availableZone = monsterZones.findIndex((zone: any) => !zone);
  
  if (availableZone < 0) {
    console.log(`[HeavyMechArmor] Nenhuma zona de monstro disponível`);
    return;
  }
  
  // For simplicity, summon the first valid target
  const targetCard = validTargets[0];
  const targetIdx = graveyard.indexOf(targetCard);
  
  if (targetIdx >= 0) {
    graveyard.splice(targetIdx, 1);
    monsterZones[availableZone] = {
      ...targetCard,
      position: 'attack',
      equippedCards: [],
    };
    
    console.log(`🔧 [HeavyMechArmor] Invocou ${targetCard.name || 'Union'} do GY`);
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
  }
}

/**
 * Continuous effect: While a Union monster is equipped to a Machine monster,
 * that monster cannot be targeted by card effects.
 */
export function hasHeavyMechArmorUntargetable(monster: any, playerField: any): boolean {
  if (!monster || !playerField) return false;
  if (!isMachineType(monster)) return false;
  
  const equippedCards = monster.equippedCards || [];
  for (const equipped of equippedCards) {
    if (isUnionMonster(equipped)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Union protection: If a Union on a Machine would be destroyed,
 * destroy this card instead (handled by standard Union protection).
 */
export async function processHeavyMechArmorProtection(
  duelsService: any,
  duelId: string,
  duel: any,
  isPlayer1: boolean,
  monster: any,
): Promise<boolean> {
  if (!monster) return false;
  
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  
  const equippedCards = monster.equippedCards || [];
  let armorIdx = -1;
  for (let i = 0; i < equippedCards.length; i++) {
    if (isHeavyMechSupportArmor(equippedCards[i])) {
      armorIdx = i;
      break;
    }
  }
  
  if (armorIdx < 0) return false;
  
  const armor = equippedCards.splice(armorIdx, 1)[0];
  if (!playerField.graveyard) playerField.graveyard = [];
  playerField.graveyard.push(armor);
  
  console.log(`🛡️ [HeavyMechArmor] Destruído no lugar do monstro equipado`);
  
  await (duelsService as any).syncDuelState(duelId, duel, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  });
  
  return true;
}
