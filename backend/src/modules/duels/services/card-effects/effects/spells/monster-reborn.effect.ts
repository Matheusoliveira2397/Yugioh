import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../../interfaces/card-effect.interface';
import { DuelsService } from '../../../../duels.service';
import { DuelUtilsService } from '../../../duel-utils.service';

/**
 * Efeito da carta Monster Reborn
 * 
 * EFEITO: Reviver um monstro do cemitério (próprio ou do oponente)
 * 
 * IMPORTANTE: Este arquivo NÃO deve ser modificado após estar funcionando.
 */
@Injectable()
export class MonsterRebornEffect extends BaseCardEffect {
  readonly cardNames = ['monster reborn'];
  readonly cardIds = ['MonsterReborn'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Monster Reborn ativada - requer escolha do jogador');
    this.logInfo('Monster Reborn será processada quando a escolha for confirmada (pendingChoice criado no gateway)');
    
    // NÃO mover Monster Reborn para o cemitério aqui - será movida quando a escolha for confirmada
    // A carta permanece na mão ou no campo (set) até o usuário confirmar a escolha
    
    // Atualizar no banco
    await this.updateDuel(context, {});
    
    return {
      success: true,
      createdPendingChoice: false, // Será criado no gateway
      message: 'Monster Reborn aguardando seleção de monstro do cemitério',
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}


