import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../../interfaces/card-effect.interface';
import { DuelsService } from '../../../../duels.service';
import { DuelUtilsService } from '../../../duel-utils.service';

/**
 * Efeito da carta Soul Taker
 * 
 * EFEITO: Destruir um monstro face-up do oponente e dar 1000 LP ao oponente
 * 
 * IMPORTANTE: Este arquivo NÃO deve ser modificado após estar funcionando.
 */
@Injectable()
export class SoulTakerEffect extends BaseCardEffect {
  readonly cardNames = ['soul taker', 'soultaker'];
  readonly cardIds = ['SoulTaker', 'soultaker'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Soul Taker: Frontend gerenciará o estado temporário - não criando pendingChoice');
    
    // IMPORTANTE: Soul Taker não cria pendingChoice aqui - o gateway gerencia o estado temporário
    // Quando ativado da mão: não vai para o campo, abre modal, se completar vai para o cemitério
    // Quando ativado do campo (set): não fica face-up, abre modal, se completar vai para o cemitério
    
    // Atualizar no banco
    await this.updateDuel(context, {});
    
    return {
      success: true,
      createdPendingChoice: false, // Será gerenciado pelo gateway
      message: 'Soul Taker aguardando seleção de monstro face-up do oponente',
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}


