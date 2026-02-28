import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Duel } from '../../entities/duel.entity';
import { DuelsService } from '../../duels.service';
import { DuelUtilsService } from '../duel-utils.service';
import { logger } from '../../../../common/utils/logger.util';

/**
 * Serviço responsável por invocações de monstros
 * Separa a lógica de invocações do DuelsService principal
 * 
 * Responsabilidades:
 * - Invocação normal
 * - Invocação especial
 * - Validação de tributos
 * - Processar efeitos de invocação
 */
@Injectable()
export class SummonService {
  constructor(
    @Inject(forwardRef(() => DuelsService))
    private duelsService: DuelsService,
    private duelUtils: DuelUtilsService,
  ) {}

  /**
   * Processa invocação normal de um monstro
   */
  async normalSummon(
    duelId: string | number,
    userId: number,
    cardId: string,
    zoneIndex: number,
    position: 'attack' | 'defense' | 'set',
    tributeZoneIndices?: number[]
  ): Promise<{ success: boolean; message?: string }> {
    // Por enquanto, delegar para DuelsService
    // TODO: Migrar implementação completa para cá
    return this.duelsService.normalSummonMonster(duelId, userId, cardId, zoneIndex, position, tributeZoneIndices);
  }

  /**
   * Calcula quantos tributos são necessários para invocar um monstro
   */
  calculateTributeRequired(monster: any): number {
    const level = monster.level || 0;
    
    if (level <= 4) {
      return 0;
    } else if (level <= 6) {
      return 1;
    } else {
      return 2;
    }
  }

  /**
   * Valida se os tributos são válidos
   */
  validateTributes(
    field: any,
    tributeZoneIndices: number[]
  ): { valid: boolean; message?: string } {
    if (!tributeZoneIndices || tributeZoneIndices.length === 0) {
      return { valid: true };
    }

    // Verificar se todos os índices são válidos
    for (const index of tributeZoneIndices) {
      if (index < 0 || index >= field.monsters.length) {
        return { valid: false, message: 'Índice de tributo inválido' };
      }

      const monster = field.monsters[index];
      if (!monster || monster === null) {
        return { valid: false, message: 'Monstro de tributo não encontrado' };
      }
    }

    return { valid: true };
  }
}

