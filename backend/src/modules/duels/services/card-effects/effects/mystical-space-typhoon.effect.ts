import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../interfaces/card-effect.interface';
import { DuelsService } from '../../../duels.service';
import { DuelUtilsService } from '../../duel-utils.service';

/**
 * Efeito da carta Mystical Space Typhoon
 * 
 * EFEITO: Escolher 1 Spell/Trap no campo e destruir
 * 
 * IMPORTANTE: Este arquivo NÃO deve ser modificado após estar funcionando.
 * Se precisar de ajustes, criar uma nova versão e manter a antiga comentada.
 */
@Injectable()
export class MysticalSpaceTyphoonEffect extends BaseCardEffect {
  readonly cardNames = ['mystical space typhoon'];
  readonly cardIds = ['MysticalSpaceTyphoon'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Processando efeito de Mystical Space Typhoon - aguardando seleção de alvo');

    const playerField = this.getPlayerField(context);
    const opponentField = this.getOpponentField(context);

    // Garantir arrays válidos
    if (!playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
      playerField.spellTrap = [null, null, null, null, null];
    }
    if (!opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
      opponentField.spellTrap = [null, null, null, null, null];
    }

    // Verificar se há pelo menos uma spell/trap no campo
    const playerSpellTraps = playerField.spellTrap.filter((s: any) => s !== null && s !== undefined);
    const opponentSpellTraps = opponentField.spellTrap.filter((s: any) => s !== null && s !== undefined);

    if (playerSpellTraps.length === 0 && opponentSpellTraps.length === 0) {
      this.logWarn('Nenhuma spell/trap no campo para Mystical Space Typhoon destruir');
      
      // Mover Mystical Space Typhoon para o cemitério mesmo sem alvo
      if (playerField?.spellTrap?.[context.zoneIndex]) {
        const activatedCard = playerField.spellTrap[context.zoneIndex];
        if (!playerField.graveyard) playerField.graveyard = [];
        playerField.graveyard.push(activatedCard);
        playerField.spellTrap[context.zoneIndex] = null;
      }
      
      await this.updateDuel(context, {});
      (this.duelsService as any).activeDuels.set(context.duelId, context.duel);
      
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Nenhuma spell/trap no campo para destruir',
      };
    }

    // IMPORTANTE: Mystical Space Typhoon não cria pendingChoice aqui
    // O frontend gerencia o estado temporário
    this.logInfo('Mystical Space Typhoon: Frontend gerenciará o estado temporário - não criando pendingChoice');

    // Atualizar no banco
    await this.updateDuel(context, {});

    // Atualizar cache
    (this.duelsService as any).activeDuels.set(context.duelId, context.duel);

    return {
      success: true,
      createdPendingChoice: false,
      message: 'Mystical Space Typhoon aguardando seleção de alvo',
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}

