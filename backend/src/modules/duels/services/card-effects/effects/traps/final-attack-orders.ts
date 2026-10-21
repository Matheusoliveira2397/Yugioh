/**
 * Final Attack Orders (Continuous Trap)
 * 
 * All face-up monsters on the field are changed to Attack Position and their battle positions cannot be changed.
 */

import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';
import { SimpleCardEffectFunction, CardEffectContext, CardEffectResult } from '../../interfaces/card-effect.interface';

export const FINAL_ATTACK_ORDERS_KEY = 'final-attack-orders';

export const FINAL_ATTACK_ORDERS_IDS = [
  'FinalAttackOrders',
  'YGOPRO_52503575',
  '52503575',
] as const;

/**
 * Final Attack Orders activation effect
 */
export const createFinalAttackOrdersEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    logger.info(`✨ [FinalAttackOrders] Ativando - forçando todos os monstros face-up para Attack Position`);
    
    // Change all face-up monsters to attack position
    const changeToAttack = (field: any) => {
      if (!field?.monsters) return 0;
      let changed = 0;
      for (let i = 0; i < field.monsters.length; i++) {
        const m = field.monsters[i];
        if (!m) continue;
        const isFaceUp = m.position === 'attack' || m.position === 'defense';
        if (isFaceUp && m.position !== 'attack') {
          m.position = 'attack';
          m.positionChangedThisTurn = true;
          changed++;
        }
      }
      return changed;
    };
    
    const p1Changed = changeToAttack((duel as any).player1Field);
    const p2Changed = changeToAttack((duel as any).player2Field);
    
    logger.info(`✨ [FinalAttackOrders] Mudou ${p1Changed + p2Changed} monstro(s) para Attack Position`);
    
    // Mark trap as continuous and face-up
    if (playerField?.spellTrap?.[zoneIndex]) {
      playerField.spellTrap[zoneIndex].position = 'face-up';
      playerField.spellTrap[zoneIndex].isContinuous = true;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    
    return {
      success: true,
      createdPendingChoice: false,
      message: 'Final Attack Orders: Todos os monstros face-up estão em Attack Position',
    };
  };
};

/**
 * Check if Final Attack Orders is preventing position changes
 */
export function isFinalAttackOrdersActive(duel: Duel): boolean {
  const checkField = (field: any): boolean => {
    if (!field?.spellTrap) return false;
    for (const st of field.spellTrap) {
      if (!st) continue;
      const cardId = (st.idCarta || st.id || st.cardId || '').toString().toLowerCase();
      const name = (st.name || st.cardName || '').toString().toLowerCase();
      const isFaceUp = st.position === 'face-up' || st.isContinuous;
      if (isFaceUp && (cardId.includes('finalattackorders') || name.includes('final attack orders'))) {
        return true;
      }
    }
    return false;
  };
  
  return checkField((duel as any).player1Field) || checkField((duel as any).player2Field);
}

/**
 * Enforce Final Attack Orders - change defense monsters to attack
 */
export function enforceFinalAttackOrders(duel: Duel): void {
  if (!isFinalAttackOrdersActive(duel)) return;
  
  const enforceField = (field: any) => {
    if (!field?.monsters) return;
    for (let i = 0; i < field.monsters.length; i++) {
      const m = field.monsters[i];
      if (!m) continue;
      const isFaceUp = m.position === 'attack' || m.position === 'defense';
      if (isFaceUp && m.position === 'defense') {
        m.position = 'attack';
        logger.info(`⚔️ [FinalAttackOrders] Forçou monstro na zona ${i} para Attack Position`);
      }
    }
  };
  
  enforceField((duel as any).player1Field);
  enforceField((duel as any).player2Field);
}
