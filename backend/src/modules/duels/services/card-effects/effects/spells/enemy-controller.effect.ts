import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../../interfaces/card-effect.interface';
import { DuelsService } from '../../../../duels.service';
import { DuelUtilsService } from '../../../duel-utils.service';

/**
 * Enemy Controller (YGOPRO_98045062)
 * Quick-Play Spell: Choose 1:
 * - Change 1 face-up opponent monster's battle position
 * - Tribute 1 monster; take control of 1 face-up opponent monster until End Phase
 */
@Injectable()
export class EnemyControllerEffect extends BaseCardEffect {
  readonly cardNames = ['enemy controller', 'enemycontroller'];
  readonly cardIds = ['EnemyController', 'YGOPRO_98045062', '98045062'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Enemy Controller ativada - frontend gerenciará escolha');
    
    const opponentField = this.getOpponentField(context);
    
    // Collect face-up opponent monsters
    const faceUpOpponentMonsters: Array<{ monster: any; zoneIndex: number }> = [];
    (opponentField?.monsters || []).forEach((m: any, index: number) => {
      if (m && m !== null && m !== undefined) {
        const position = m.position || 'attack';
        const isFaceUp = position === 'attack' || position === 'defense';
        if (isFaceUp) {
          faceUpOpponentMonsters.push({ monster: m, zoneIndex: index });
        }
      }
    });
    
    if (faceUpOpponentMonsters.length === 0) {
      this.logInfo('Nenhum monstro face-up do oponente para Enemy Controller');
      await this.updateDuel(context, {});
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Enemy Controller: Sem alvos válidos',
      };
    }
    
    // Frontend will handle choice between effects
    this.logInfo('Enemy Controller: Frontend gerenciará escolha de efeito');
    await this.updateDuel(context, {});
    
    return {
      success: true,
      createdPendingChoice: false,
      message: 'Enemy Controller aguardando escolha de efeito',
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}
