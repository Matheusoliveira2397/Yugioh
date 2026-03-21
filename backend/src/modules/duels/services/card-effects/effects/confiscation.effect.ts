import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../interfaces/card-effect.interface';
import { DuelsService } from '../../../duels.service';
import { DuelUtilsService } from '../../duel-utils.service';

/**
 * Efeito da carta Confiscation
 * 
 * EFEITO: Pagar 1000 LP, ver mão do oponente e escolher uma carta para ir ao cemitério
 * 
 * IMPORTANTE: Este arquivo NÃO deve ser modificado após estar funcionando.
 */
@Injectable()
export class ConfiscationEffect extends BaseCardEffect {
  readonly cardNames = ['confiscation'];
  readonly cardIds = ['Confiscation'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Confiscation ativada - requer escolha do jogador');
    
    const { duelId, duel, isPlayer1 } = context;

    const currentLP = Number(isPlayer1 ? duel.player1LifePoints : duel.player2LifePoints);
    if (!Number.isFinite(currentLP) || currentLP < 1000) {
      this.logInfo(`Confiscation: LP insuficientes (${currentLP} < 1000)`);
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Você precisa de pelo menos 1000 LP para ativar esta carta.',
      };
    }
    
    // Reduzir 1000 LP do jogador
    if (isPlayer1) {
      duel.player1LifePoints = Math.max(0, (duel.player1LifePoints || 0) - 1000);
      this.logInfo(`Player 1 pagou 1000 LP. LP restante: ${duel.player1LifePoints}`);
    } else {
      duel.player2LifePoints = Math.max(0, (duel.player2LifePoints || 0) - 1000);
      this.logInfo(`Player 2 pagou 1000 LP. LP restante: ${duel.player2LifePoints}`);
    }
    
    // Verificar se o jogador perdeu por LP
    if (duel.player1LifePoints <= 0 || duel.player2LifePoints <= 0) {
      const winnerId = duel.player1LifePoints <= 0 ? duel.player2Id : duel.player1Id;
      await (this.duelsService as any).finishDuel(duelId, 
        duel.player1LifePoints <= 0 ? 'PLAYER2_WIN' : 'PLAYER1_WIN', 
        winnerId
      );
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Jogador perdeu por LP',
      };
    }
    
    // Atualizar LP no banco
    await this.updateDuel(context, {
      player1LifePoints: duel.player1LifePoints,
      player2LifePoints: duel.player2LifePoints,
    });
    
    this.logInfo('Confiscation: LP atualizados no banco. O gateway deve emitir confiscationShowHand');
    // O gateway detectará isso e emitirá um evento especial para mostrar a mão do oponente
    
    return {
      success: true,
      createdPendingChoice: false, // Será criado no gateway
      message: 'Confiscation aguardando seleção de carta da mão do oponente',
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}


