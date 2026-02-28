import { Injectable } from '@nestjs/common';
import { Duel } from '../../entities/duel.entity';
import { logger } from '../../../../common/utils/logger.util';

/**
 * Serviço responsável por cálculos de dano e Life Points
 * Separa a lógica de cálculo de dano do DuelsService principal
 * 
 * Responsabilidades:
 * - Calcular dano de batalha (ATK vs ATK, ATK vs DEF)
 * - Calcular dano direto
 * - Aplicar dano aos Life Points
 * - Verificar vitória (LP <= 0)
 * - Processar efeitos relacionados a dano (WhiteMagicalHat, MaskedSorcerer)
 */
@Injectable()
export class DamageCalculationService {
  /**
   * Calcula o dano de batalha entre dois monstros
   * @param attackerAtk - ATK total do atacante
   * @param targetAtk - ATK total do alvo (se em ataque)
   * @param targetDef - DEF total do alvo (se em defesa)
   * @param targetPosition - Posição do alvo ('attack' ou 'defense')
   * @returns Objeto com dano ao atacante, dano ao defensor, e se o alvo foi destruído
   */
  calculateBattleDamage(
    attackerAtk: number,
    targetAtk: number | null,
    targetDef: number | null,
    targetPosition: 'attack' | 'defense' | 'set'
  ): {
    attackerDamage: number;
    defenderDamage: number;
    targetDestroyed: boolean;
  } {
    if (targetPosition === 'attack' && targetAtk !== null) {
      // Ataque vs Ataque
      if (attackerAtk > targetAtk) {
        return {
          attackerDamage: 0,
          defenderDamage: attackerAtk - targetAtk,
          targetDestroyed: true,
        };
      } else if (attackerAtk < targetAtk) {
        return {
          attackerDamage: targetAtk - attackerAtk,
          defenderDamage: 0,
          targetDestroyed: true, // Atacante destruído
        };
      } else {
        // Empate: ambos destruídos
        return {
          attackerDamage: 0,
          defenderDamage: 0,
          targetDestroyed: true,
        };
      }
    } else if ((targetPosition === 'defense' || targetPosition === 'set') && targetDef !== null) {
      // Ataque vs Defesa
      if (attackerAtk > targetDef) {
        return {
          attackerDamage: 0,
          defenderDamage: 0, // Monstro em defesa destruído não causa dano
          targetDestroyed: true,
        };
      } else if (attackerAtk < targetDef) {
        return {
          attackerDamage: targetDef - attackerAtk,
          defenderDamage: 0,
          targetDestroyed: false,
        };
      } else {
        // Empate: monstro em defesa destruído, nenhum dano
        return {
          attackerDamage: 0,
          defenderDamage: 0,
          targetDestroyed: true,
        };
      }
    }

    // Fallback
    return {
      attackerDamage: 0,
      defenderDamage: 0,
      targetDestroyed: false,
    };
  }

  /**
   * Calcula o dano de ataque direto
   * @param attackerAtk - ATK total do atacante
   * @returns Dano ao defensor
   */
  calculateDirectAttackDamage(attackerAtk: number): number {
    return attackerAtk;
  }

  /**
   * Aplica dano aos Life Points e verifica vitória
   * @param duel - Duelo atual
   * @param isPlayer1 - Se o jogador que recebe dano é Player1
   * @param damage - Quantidade de dano
   * @returns Novo valor de Life Points
   */
  applyDamage(
    duel: Duel,
    isPlayer1: boolean,
    damage: number
  ): { newLifePoints: number; duelEnded: boolean; winnerId?: number } {
    const currentLP = isPlayer1 ? duel.player1LifePoints : duel.player2LifePoints;
    const newLP = Math.max(0, currentLP - damage);

    if (isPlayer1) {
      duel.player1LifePoints = newLP;
    } else {
      duel.player2LifePoints = newLP;
    }

    if (newLP <= 0) {
      return {
        newLifePoints: newLP,
        duelEnded: true,
        winnerId: isPlayer1 ? duel.player2Id : duel.player1Id,
      };
    }

    return {
      newLifePoints: newLP,
      duelEnded: false,
    };
  }
}

