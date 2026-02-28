import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Duel, TurnPhase } from '../../entities/duel.entity';
import { DuelsService } from '../../duels.service';
import { DuelUtilsService } from '../duel-utils.service';
import { CardEffectsService } from '../card-effects.service';
import { logger } from '../../../../common/utils/logger.util';

/**
 * Serviço responsável por toda a lógica de batalha
 * Separa a lógica de batalha do DuelsService principal
 * 
 * Responsabilidades:
 * - Processar ataques entre monstros
 * - Calcular dano de batalha
 * - Gerenciar destruição de monstros
 * - Processar efeitos de flip durante batalha
 * - Coordenar traps durante batalha
 */
@Injectable()
export class BattleService {
  constructor(
    @Inject(forwardRef(() => DuelsService))
    private duelsService: DuelsService,
    private duelUtils: DuelUtilsService,
    private cardEffects: CardEffectsService,
  ) {}

  /**
   * Processa um ataque de monstro
   * Este método orquestra todo o fluxo de batalha
   */
  async attackMonster(
    duelId: string | number,
    userId: number,
    attackerZoneIndex: number,
    targetZoneIndex: number | null
  ): Promise<{ success: boolean; message?: string; damage?: number; destroyed?: boolean }> {
    // Por enquanto, delegar para DuelsService
    // TODO: Migrar implementação completa para cá
    return this.duelsService.attackMonster(duelId, userId, attackerZoneIndex, targetZoneIndex);
  }
}

