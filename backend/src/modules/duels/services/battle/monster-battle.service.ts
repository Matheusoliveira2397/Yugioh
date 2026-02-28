import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Duel } from '../../entities/duel.entity';
import { DuelsService } from '../../duels.service';
import { DuelUtilsService } from '../duel-utils.service';
import { CardEffectsService } from '../card-effects.service';
import { DamageCalculationService } from './damage-calculation.service';
import { GraveyardService } from './graveyard.service';
import { EquipmentService } from './equipment.service';
import { logger } from '../../../../common/utils/logger.util';

/**
 * Serviço responsável por lógica específica de batalha entre monstros
 * Separa a lógica de batalha de monstros do DuelsService principal
 * 
 * Responsabilidades:
 * - Processar batalha ATK vs ATK
 * - Processar batalha ATK vs DEF
 * - Processar efeitos de flip durante batalha
 * - Gerenciar destruição de monstros
 * - Processar efeitos especiais de monstros (Marshmallon, etc)
 */
@Injectable()
export class MonsterBattleService {
  constructor(
    @Inject(forwardRef(() => DuelsService))
    private duelsService: DuelsService,
    private duelUtils: DuelUtilsService,
    private cardEffects: CardEffectsService,
    private damageCalculation: DamageCalculationService,
    private graveyard: GraveyardService,
    private equipment: EquipmentService,
  ) {}

  /**
   * Processa batalha entre dois monstros em posição de ataque
   */
  async processAttackVsAttack(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    attackerZoneIndex: number,
    targetZoneIndex: number,
    attacker: any,
    target: any,
    attackerAtk: number,
    targetAtk: number
  ): Promise<{
    destroyed: boolean;
    damage: number;
    attackerDestroyed: boolean;
    targetDestroyed: boolean;
  }> {
    // Por enquanto, delegar para DuelsService
    // TODO: Migrar implementação completa para cá
    // Esta será uma das primeiras coisas a migrar pois é bem isolada
    return {
      destroyed: false,
      damage: 0,
      attackerDestroyed: false,
      targetDestroyed: false,
    };
  }

  /**
   * Processa batalha entre monstro atacante e monstro em defesa
   */
  async processAttackVsDefense(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    attackerZoneIndex: number,
    targetZoneIndex: number,
    attacker: any,
    target: any,
    attackerAtk: number,
    targetDef: number,
    wasFaceDown: boolean
  ): Promise<{
    destroyed: boolean;
    damage: number;
  }> {
    // Por enquanto, delegar para DuelsService
    // TODO: Migrar implementação completa para cá
    return {
      destroyed: false,
      damage: 0,
    };
  }

  /**
   * Processa efeito de flip de um monstro durante batalha
   */
  async processFlipEffectDuringBattle(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    flippedCard: any,
    zoneIndex: number
  ): Promise<{ fiberJarActivated: boolean; cardRemoved: boolean }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    const isFiberJar = this.duelUtils.isExactCard(flippedCard, 'FiberJar');
    const isSnowmanEater = this.duelUtils.isExactCard(flippedCard, 'SnowmanEater');
    const isMorphingJar = this.duelUtils.isExactCard(flippedCard, 'MorphingJar');
    const isDekoichi = this.duelUtils.isExactCard(flippedCard, 'DekoichiTheBattlechantedLocomotive');
    
    if (isFiberJar || isSnowmanEater || isMorphingJar || isDekoichi) {
      await this.cardEffects.processFlipEffect(duelIdStr, duel, isPlayer1, flippedCard, zoneIndex);
      
      // Verificar se a carta ainda está no campo após o efeito de flip
      const updatedDuel = await this.duelsService.findDuelByIdFromDatabase(duelIdStr);
      if (updatedDuel) {
        const defenderField = isPlayer1 ? (updatedDuel as any).player2Field : (updatedDuel as any).player1Field;
        const cardAfterFlip = defenderField?.monsters?.[zoneIndex];
        
        if (!cardAfterFlip) {
          return { fiberJarActivated: isFiberJar, cardRemoved: true };
        }
      }
      
      return { fiberJarActivated: isFiberJar, cardRemoved: false };
    }
    
    return { fiberJarActivated: false, cardRemoved: false };
  }
}

