import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../interfaces/card-effect.interface';
import { DuelsService } from '../../../duels.service';
import { DuelUtilsService } from '../../duel-utils.service';

/**
 * Efeito da carta Last Will
 * 
 * EFEITO: Invocar por invocação especial 1 monstro com ATK <= 1500 do deck se um monstro foi destruído no campo do jogador neste turno
 * 
 * IMPORTANTE: Este arquivo NÃO deve ser modificado após estar funcionando.
 */
@Injectable()
export class LastWillEffect extends BaseCardEffect {
  readonly cardNames = ['last will'];
  readonly cardIds = ['LastWill'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Last Will ativada - requer verificação e escolha do jogador');
    
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = this.getPlayerField(context);
    
    // Verificar se um monstro foi destruído no campo do jogador neste turno
    const monsterDestroyedThisTurn = playerField?.monsterDestroyedThisTurn || false;
    
    this.logInfo(`Last Will: Verificando condições - monsterDestroyedThisTurn: ${monsterDestroyedThisTurn}`);
    
    // Se nenhum monstro foi destruído no campo do jogador neste turno, não pode ativar
    if (!monsterDestroyedThisTurn) {
      this.logInfo('Nenhum monstro foi destruído no campo do jogador neste turno - não pode ser ativada');
      // Mover Last Will para o cemitério já que não pode ser usada
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
        message: 'Nenhum monstro foi destruído no campo do jogador neste turno',
      };
    }
    
    // NÃO mover Last Will para o cemitério aqui - será movida quando a escolha for confirmada
    // A carta permanece na mão ou no campo (set) até o usuário confirmar a escolha
    this.logInfo('Last Will aguardando seleção de monstro do deck - carta permanece onde estava');
    
    // Coletar monstros do deck com ATK <= 1500
    const deck = playerField?.deck || [];
    const eligibleMonsters: Array<{ monster: any; deckIndex: number }> = [];
    
    deck.forEach((c: any, deckIndex: number) => {
      if (!c) return;
      
      // Verificar se é um monstro
      const cardType = (c.type || c.cardType || '').toString().toUpperCase().trim();
      const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
      if (!isMonster) return;
      
      // Verificar se tem ATK <= 1500
      const atk = Number(c.atk || c.cardAtk || 0);
      if (isNaN(atk) || atk > 1500) return;
      
      // Adicionar com o índice real do deck
      eligibleMonsters.push({
        ...c,
        deckIndex: deckIndex,
      });
    });
    
    // Se não houver monstros elegíveis no deck, não precisa de escolha
    if (eligibleMonsters.length === 0) {
      this.logInfo('Nenhum monstro com ATK <= 1500 no deck');
      await this.updateDuel(context, {});
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Nenhum monstro com ATK <= 1500 no deck',
      };
    }
    
    // Atualizar no banco
    await this.updateDuel(context, {});
    
    this.logInfo(`Last Will: ${eligibleMonsters.length} monstros com ATK <= 1500 encontrados. O gateway deve emitir lastWillShowDeck`);
    // O gateway detectará isso e emitirá um evento especial para mostrar os monstros do deck
    
    return {
      success: true,
      createdPendingChoice: false, // Será criado no gateway
      message: `Last Will: ${eligibleMonsters.length} monstros elegíveis encontrados no deck`,
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}


