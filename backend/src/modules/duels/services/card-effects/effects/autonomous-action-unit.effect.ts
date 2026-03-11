import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../interfaces/card-effect.interface';
import { DuelsService } from '../../../duels.service';
import { DuelUtilsService } from '../../duel-utils.service';

/**
 * Efeito da carta Autonomous Action Unit
 * 
 * EFEITO: Paga 1500 LPs, seleciona 1 monstro do cemitério do oponente, invoca por invocação especial e equipa
 * 
 * IMPORTANTE: Este arquivo NÃO deve ser modificado após estar funcionando.
 */
@Injectable()
export class AutonomousActionUnitEffect extends BaseCardEffect {
  readonly cardNames = ['autonomous action unit'];
  readonly cardIds = ['AutonomousActionUnit'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Processando efeito de Autonomous Action Unit');
    
    const { duelId, duel, isPlayer1 } = context;
    const playerField = this.getPlayerField(context);
    const opponentField = this.getOpponentField(context);
    
    // Verificar se o jogador tem pelo menos 1500 LPs
    const playerLifePoints = Number(isPlayer1 ? duel.player1LifePoints : duel.player2LifePoints);
    if (playerLifePoints < 1500) {
      this.logInfo(`Jogador não tem LPs suficientes (${playerLifePoints} < 1500)`);
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Jogador não tem LPs suficientes (1500)',
      };
    }
    
    // Coletar monstros do cemitério do oponente
    const opponentGraveyard = opponentField?.graveyard || [];
    const opponentMonsters = opponentGraveyard.filter((c: any) => {
      const cardType = c.type || c.cardType;
      return cardType === 'Monster';
    });
    
    // Se não houver monstros no cemitério do oponente, não pode ativar
    if (opponentMonsters.length === 0) {
      this.logInfo('Nenhum monstro no cemitério do oponente');
      await this.updateDuel(context, {});
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Nenhum monstro no cemitério do oponente',
      };
    }
    
    // Verificar se há espaço no campo do jogador
    if (!playerField.monsters || !Array.isArray(playerField.monsters)) {
      playerField.monsters = [null, null, null, null, null];
    }
    const emptyZoneIndex = playerField.monsters.findIndex((m: any) => m === null || m === undefined);
    if (emptyZoneIndex === -1) {
      this.logInfo('Não há espaço no campo para invocar o monstro');
      await this.updateDuel(context, {});
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Não há espaço no campo para invocar o monstro',
      };
    }
    
    // NÃO mover Autonomous Action Unit para o cemitério ainda - ela ficará no campo equipada ao monstro
    // A carta permanece no campo até ser removida
    
    // Atualizar no banco
    await this.updateDuel(context, {});
    
    this.logInfo('Autonomous Action Unit: O gateway deve emitir autonomousActionUnitShowOpponentGraveyard');
    // O gateway detectará isso e emitirá um evento especial para mostrar o cemitério do oponente
    
    return {
      success: true,
      createdPendingChoice: false, // Será criado no gateway
      message: 'Autonomous Action Unit aguardando seleção de monstro do cemitério do oponente',
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}


