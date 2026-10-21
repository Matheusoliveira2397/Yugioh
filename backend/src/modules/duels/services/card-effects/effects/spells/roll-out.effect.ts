/**
 * Roll Out! (YGOPRO_91597389)
 * Target Union in GY; equip to appropriate monster you control
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const ROLL_OUT_KEY = 'roll-out';

export const ROLL_OUT_CARD_IDS = [
  'RollOut',
  'Roll Out!',
  'YGOPRO_91597389',
  '91597389',
] as const;

export const ROLL_OUT_CARD_NAMES = [
  'roll out',
  'roll out!',
  'role pra fora',
  'role pra fora!',
] as const;

export function isRollOut(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of ROLL_OUT_CARD_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of ROLL_OUT_CARD_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('rollout') || nameCompact.includes('roleprafora')) {
    return true;
  }
  if (id.includes('91597389')) {
    return true;
  }
  return false;
}

export function isUnionMonster(card: any): boolean {
  if (!card) return false;
  const text = String(card.desc || card.description || '').toLowerCase();
  return text.includes('union');
}

/**
 * Roll Out! effect: Target 1 Union monster in your GY;
 * equip it to an appropriate monster you control.
 * 
 * For simplicity, this implementation equips to the first valid Machine monster.
 */
export async function activateRollOut(
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
    console.log(`[RollOut] Nenhum Union encontrado no GY`);
    return;
  }
  
  // Find appropriate monster to equip to (Machine)
  const monsterZones = playerField.monsterZones || [];
  let targetMonsterIdx = -1;
  for (let i = 0; i < monsterZones.length; i++) {
    const monster = monsterZones[i];
    if (monster && monster !== null) {
      const race = String(monster.race || '').toLowerCase();
      const isMachine = race.includes('machine') || race.includes('maquina') || race.includes('máquina');
      if (isMachine) {
        targetMonsterIdx = i;
        break;
      }
    }
  }
  
  if (targetMonsterIdx < 0) {
    console.log(`[RollOut] Nenhum monstro Machine encontrado para equipar`);
    return;
  }
  
  // Equip the first Union to the first Machine
  const unionCard = validTargets[0];
  const unionIdx = graveyard.indexOf(unionCard);
  
  if (unionIdx >= 0) {
    graveyard.splice(unionIdx, 1);
    const targetMonster = monsterZones[targetMonsterIdx];
    if (!targetMonster.equippedCards) targetMonster.equippedCards = [];
    targetMonster.equippedCards.push(unionCard);
    
    console.log(`🎲 [RollOut] Equipou ${unionCard.name || 'Union'} do GY ao monstro ${targetMonster.name || 'Machine'}`);
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
  }
}
