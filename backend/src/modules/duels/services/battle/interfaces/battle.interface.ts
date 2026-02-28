/**
 * Interfaces para serviços de batalha
 * Garantem tipagem forte e escalabilidade
 */

import { Duel } from '../../../entities/duel.entity';

/**
 * Resultado de um ataque
 */
export interface AttackResult {
  success: boolean;
  message?: string;
  damage?: number;
  destroyed?: boolean;
}

/**
 * Resultado de cálculo de dano de batalha
 */
export interface BattleDamageResult {
  attackerDamage: number;
  defenderDamage: number;
  targetDestroyed: boolean;
}

/**
 * Resultado de aplicação de dano
 */
export interface DamageApplicationResult {
  newLifePoints: number;
  duelEnded: boolean;
  winnerId?: number;
}

/**
 * Resultado de validação de ataque
 */
export interface AttackValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Resultado de verificação de bloqueio
 */
export interface BlockCheckResult {
  blocked: boolean;
  message?: string;
}

/**
 * Resultado de processamento de efeito de flip
 */
export interface FlipEffectResult {
  fiberJarActivated: boolean;
  cardRemoved: boolean;
}

/**
 * Contexto de batalha
 */
export interface BattleContext {
  duelId: string | number;
  duel: Duel;
  isPlayer1: boolean;
  attackerZoneIndex: number;
  targetZoneIndex: number | null;
  attacker: any;
  target: any | null;
  attackerAtk: number;
  targetAtk?: number;
  targetDef?: number;
}

