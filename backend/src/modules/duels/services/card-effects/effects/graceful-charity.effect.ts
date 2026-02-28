import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../interfaces/card-effect.interface';
import { DuelsService } from '../../../duels.service';
import { DuelUtilsService } from '../../duel-utils.service';

/**
 * Efeito da carta Graceful Charity
 * 
 * EFEITO: Comprar 3 cartas e depois descartar 2 cartas da mão
 * 
 * IMPORTANTE: Este arquivo NÃO deve ser modificado após estar funcionando.
 */
@Injectable()
export class GracefulCharityEffect extends BaseCardEffect {
  readonly cardNames = ['graceful charity'];
  readonly cardIds = ['GracefulCharity'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Processando efeito de Graceful Charity - comprando 3 cartas e requerendo descarte de 2 cartas');
    
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
    
    // Comprar 3 cartas
    for (let i = 0; i < 3; i++) {
      await this.duelsService.drawCard(duelId, userId);
    }
    
    this.logInfo('Graceful Charity: Jogador comprou 3 cartas');
    
    // Buscar duelo atualizado após comprar cartas
    const updatedDuel = await (this.duelsService as any).findDuelByIdFromDatabase(duelId);
    if (updatedDuel) {
      Object.assign(duel, updatedDuel);
    }
    
    // Mover Graceful Charity para o cemitério após ativação
    const playerField = this.getPlayerField(context);
    if (playerField?.spellTrap?.[zoneIndex]) {
      const activatedCard = playerField.spellTrap[zoneIndex];
      
      if (!playerField.graveyard) {
        playerField.graveyard = [];
      }
      
      playerField.graveyard.push(activatedCard);
      playerField.spellTrap[zoneIndex] = null;
      
      this.logInfo('Graceful Charity movida para o cemitério após ativação');
    }
    
    // Atualizar no banco
    await this.updateDuel(context, {});
    
    this.logInfo('Graceful Charity: Cartas compradas. O gateway deve emitir gracefulCharityShowHand');
    // O gateway detectará isso e emitirá um evento especial para mostrar a mão do jogador para descartar
    
    return {
      success: true,
      createdPendingChoice: false, // Será criado no gateway
      message: 'Graceful Charity: Comprei 3 cartas - aguardando descarte de 2 cartas',
    };
  }
}


