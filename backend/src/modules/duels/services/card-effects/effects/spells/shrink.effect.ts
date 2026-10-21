import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../../interfaces/card-effect.interface';
import { DuelsService } from '../../../../duels.service';
import { DuelUtilsService } from '../../../duel-utils.service';

/**
 * Shrink (YGOPRO_55713623)
 * Target 1 face-up monster on the field; its original ATK becomes halved until the end of this turn.
 */
@Injectable()
export class ShrinkEffect extends BaseCardEffect {
  readonly cardNames = ['shrink'];
  readonly cardIds = ['Shrink', 'YGOPRO_55713623'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Shrink: Frontend gerenciará seleção de alvo');
    
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = this.getPlayerField(context);
    
    // Shrink doesn't create pendingChoice - gateway will handle target selection
    // The gateway will call a resolver function when target is selected
    
    // Move to GY immediately (will be activated from GY if needed)
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await this.updateDuel(context, {});
    
    return {
      success: true,
      createdPendingChoice: false,
      message: 'Shrink aguardando seleção de alvo',
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}
