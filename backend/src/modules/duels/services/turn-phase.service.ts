import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Duel } from '../entities/duel.entity';
import { DuelsService } from '../duels.service';
import { logger } from '../../../common/utils/logger.util';

/**
 * Serviço responsável por gerenciar fases do turno
 * Separa lógica de fases do DuelsService principal
 */
@Injectable()
export class TurnPhaseService {
  constructor(
    @Inject(forwardRef(() => DuelsService))
    private duelsService: DuelsService,
  ) {}

  /**
   * Processa a fase de compra (Draw Phase)
   */
  async processDrawPhase(duelId: string | number): Promise<Duel | null> {
    // Por enquanto, delegar para DuelsService
    // TODO: Mover implementação completa para cá
    return this.duelsService.processDrawPhase(duelId);
  }

  /**
   * Avança para o próximo turno
   */
  async advanceToNextTurn(duelId: string | number): Promise<{ needsDiscard: boolean; duel?: Duel }> {
    return this.duelsService.advanceToNextTurn(duelId);
  }
}

