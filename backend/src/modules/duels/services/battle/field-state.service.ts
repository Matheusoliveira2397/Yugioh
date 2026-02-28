import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Duel } from '../../entities/duel.entity';
import { DuelsService } from '../../duels.service';
import { logger } from '../../../../common/utils/logger.util';

/**
 * Serviço responsável por gerenciamento de estado do campo
 * Separa a lógica de estado do campo do DuelsService principal
 * 
 * Responsabilidades:
 * - Atualizar estado do campo após ações
 * - Gerenciar sincronização entre memória e banco
 * - Garantir consistência do estado
 */
@Injectable()
export class FieldStateService {
  constructor(
    @Inject(forwardRef(() => DuelsService))
    private duelsService: DuelsService,
  ) {}

  /**
   * Atualiza o estado do campo no duelo e salva no banco
   */
  async updateFieldState(
    duelId: string | number,
    duel: Duel,
    player1Field: any,
    player2Field: any
  ): Promise<void> {
    (duel as any).player1Field = player1Field;
    (duel as any).player2Field = player2Field;

    await this.duelsService.updateDuelInDatabase(duelId, {
      player1Field,
      player2Field,
    } as any);
  }

  /**
   * Re-busca o estado do campo do banco
   */
  async refreshFieldState(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean
  ): Promise<{ player1Field: any; player2Field: any }> {
    const updatedDuel = await this.duelsService.findDuelByIdFromDatabase(
      typeof duelId === 'string' ? duelId : duelId.toString()
    );

    if (!updatedDuel) {
      throw new Error('Duelo não encontrado');
    }

    return {
      player1Field: (updatedDuel as any).player1Field,
      player2Field: (updatedDuel as any).player2Field,
    };
  }
}

