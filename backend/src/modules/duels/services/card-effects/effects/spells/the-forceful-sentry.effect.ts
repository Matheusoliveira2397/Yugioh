import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../../interfaces/card-effect.interface';
import { DuelsService } from '../../../../duels.service';
import { DuelUtilsService } from '../../../duel-utils.service';

/**
 * Efeito da carta The Forceful Sentry
 * 
 * EFEITO: Ver mão do oponente e escolher uma carta para voltar ao deck
 * 
 * IMPORTANTE: Este arquivo NÃO deve ser modificado após estar funcionando.
 */
@Injectable()
export class TheForcefulSentryEffect extends BaseCardEffect {
  readonly cardNames = ['the forceful sentry'];
  readonly cardIds = ['TheForcefulSentry'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('The Forceful Sentry ativada - requer escolha do jogador');
    // Retornar informações sobre o efeito que precisa de escolha
    // O gateway detectará isso e emitirá um evento especial
    
    // Atualizar no banco
    await this.updateDuel(context, {});
    
    return {
      success: true,
      createdPendingChoice: false, // Será criado no gateway
      message: 'The Forceful Sentry aguardando seleção de carta da mão do oponente',
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}


