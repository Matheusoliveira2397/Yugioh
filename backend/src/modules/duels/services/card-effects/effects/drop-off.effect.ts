import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../interfaces/card-effect.interface';
import { DuelsService } from '../../../duels.service';
import { DuelUtilsService } from '../../duel-utils.service';
import { DuelActionType } from '../../../entities/duel-log.entity';

/**
 * Efeito da carta Drop Off
 * 
 * EFEITO: Ativa automaticamente na Draw Phase do oponente,
 * descartando a carta que ele iria comprar e mandando ela para o cemitério
 * 
 * IMPORTANTE: Este arquivo NÃO deve ser modificado após estar funcionando.
 * Se precisar de ajustes, criar uma nova versão e manter a antiga comentada.
 */
@Injectable()
export class DropOffEffect extends BaseCardEffect {
  readonly cardNames = ['drop off', 'dropoff'];
  readonly cardIds = ['DropOff'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  /**
   * Drop Off não é ativada manualmente, mas sim automaticamente na Draw Phase
   * Este método não deve ser chamado diretamente
   */
  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logWarn('Drop Off não deve ser processada via process() - é ativada automaticamente na Draw Phase');
    return {
      success: false,
      message: 'Drop Off é ativada automaticamente na Draw Phase',
    };
  }

  /**
   * Verifica se Drop Off pode ser ativada (verifica se Jinzo está no campo)
   */
  canActivate(context: CardEffectContext): boolean {
    const jinzoOnField = this.duelUtils.isJinzoOnField(context.duel);
    if (jinzoOnField) {
      this.logInfo('Jinzo está no campo - Drop Off não pode ser ativada');
      return false;
    }
    return true;
  }
}

