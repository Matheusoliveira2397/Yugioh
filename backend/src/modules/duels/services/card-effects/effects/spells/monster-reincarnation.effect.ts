import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../../interfaces/card-effect.interface';
import { DuelsService } from '../../../../duels.service';
import { DuelUtilsService } from '../../../duel-utils.service';

/**
 * Efeito da carta Monster Reincarnation
 * 
 * EFEITO: Descartar 1 carta da mão, depois escolher 1 monstro no seu cemitério e devolvê-lo para a mão
 * 
 * IMPORTANTE: Este arquivo NÃO deve ser modificado após estar funcionando.
 */
@Injectable()
export class MonsterReincarnationEffect extends BaseCardEffect {
  readonly cardNames = ['monster reincarnation'];
  readonly cardIds = ['MonsterReincarnation'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Monster Reincarnation ativada - requer descarte de carta e escolha de monstro do cemitério');
    
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = this.getPlayerField(context);
    
    // Verificar se o jogador tem cartas na mão para descartar
    const playerHand = playerField?.hand || [];
    if (playerHand.length === 0) {
      this.logInfo('Jogador não tem cartas na mão para descartar');
      // Mover Monster Reincarnation para o cemitério já que não pode ser usada
      if (playerField?.spellTrap?.[zoneIndex]) {
        const activatedCard = playerField.spellTrap[zoneIndex];
        if (!playerField.graveyard) {
          playerField.graveyard = [];
        }
        playerField.graveyard.push(activatedCard);
        playerField.spellTrap[zoneIndex] = null;
      }
      await this.updateDuel(context, {});
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Você não tem cartas na mão para descartar',
      };
    }
    
    // NÃO mover Monster Reincarnation para o cemitério aqui - será movida quando a escolha for confirmada
    // A carta permanece na mão ou no campo (set) até o usuário confirmar a escolha
    this.logInfo('Monster Reincarnation aguardando descarte de carta da mão - carta permanece onde estava');
    
    // Atualizar no banco
    await this.updateDuel(context, {});
    
    this.logInfo('Monster Reincarnation: O gateway deve emitir monsterReincarnationShowHand para descartar carta');
    // O gateway detectará isso e emitirá um evento especial para mostrar a mão do jogador para descartar
    
    return {
      success: true,
      createdPendingChoice: false, // Será criado no gateway
      message: 'Monster Reincarnation aguardando descarte de carta da mão',
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}


