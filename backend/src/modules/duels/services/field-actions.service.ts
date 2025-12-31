import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Duel } from '../entities/duel.entity';
import { DuelsService } from '../duels.service';
import { DuelUtilsService } from './duel-utils.service';
import { CardEffectsService } from './card-effects.service';
import { logger } from '../../../common/utils/logger.util';

/**
 * Serviço responsável por ações no campo de batalha
 * Separa lógica de ações do campo do DuelsService principal
 */
@Injectable()
export class FieldActionsService {
  constructor(
    @Inject(forwardRef(() => DuelsService))
    private duelsService: DuelsService,
    private duelUtils: DuelUtilsService,
    private cardEffects: CardEffectsService,
  ) {}

  /**
   * Coloca uma carta no campo
   */
  async placeCardOnField(
    duelId: string | number,
    userId: number,
    cardId: string,
    zoneIndex: number,
    position: 'attack' | 'defense' | 'face-up' | 'set',
    cardType?: string,
    skipEffectProcessing?: boolean,
  ): Promise<{ success: boolean; message?: string }> {
    // Por enquanto, delegar para DuelsService
    // TODO: Mover implementação completa para cá
    return this.duelsService.placeCardOnField(duelId, userId, cardId, zoneIndex, position, cardType, skipEffectProcessing);
  }

  /**
   * Invoca um monstro normalmente
   */
  async normalSummonMonster(
    duelId: string | number,
    userId: number,
    cardId: string,
    zoneIndex: number,
    position: 'attack' | 'defense' | 'set',
    tributeZoneIndices?: number[],
  ): Promise<{ success: boolean; message?: string }> {
    return this.duelsService.normalSummonMonster(duelId, userId, cardId, zoneIndex, position, tributeZoneIndices);
  }

  /**
   * Muda a posição de um monstro
   */
  async changeMonsterPosition(
    duelId: string | number,
    userId: number,
    zoneIndex: number,
    newPosition: 'attack' | 'defense',
  ): Promise<{ success: boolean; message?: string }> {
    return this.duelsService.changeMonsterPosition(duelId, userId, zoneIndex, newPosition);
  }

  /**
   * Vira um monstro de face-down para face-up
   */
  async flipMonster(
    duelId: string | number,
    userId: number,
    zoneIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.duelsService.flipMonster(duelId, userId, zoneIndex);
  }

  /**
   * Processa um ataque de monstro
   */
  async attackMonster(
    duelId: string | number,
    userId: number,
    attackerZoneIndex: number,
    targetZoneIndex: number | null,
  ): Promise<{ success: boolean; message?: string; damage?: number; destroyed?: boolean }> {
    return this.duelsService.attackMonster(duelId, userId, attackerZoneIndex, targetZoneIndex);
  }
}

