import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../../interfaces/card-effect.interface';
import { DuelsService } from '../../../../duels.service';
import { DuelUtilsService } from '../../../duel-utils.service';

/**
 * Efeito da carta Reinforcement Of The Army
 * 
 * EFEITO: Adicionar 1 monstro Warrior de Level 4 ou menos do deck à mão
 * 
 * IMPORTANTE: Este arquivo NÃO deve ser modificado após estar funcionando.
 */
@Injectable()
export class ReinforcementOfTheArmyEffect extends BaseCardEffect {
  readonly cardNames = ['reinforcement of the army', 'reinforcementofthearmy', 'rota'];
  readonly cardIds = ['ReinforcementOfTheArmy', 'ROTA'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Reinforcement Of The Army ativada - requer escolha do jogador');
    
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = this.getPlayerField(context);
    
    // Mover Reinforcement Of The Army para o cemitério após ativação
    if (playerField?.spellTrap?.[zoneIndex]) {
      const activatedCard = playerField.spellTrap[zoneIndex];
      
      if (!playerField.graveyard) {
        playerField.graveyard = [];
      }
      
      playerField.graveyard.push(activatedCard);
      playerField.spellTrap[zoneIndex] = null;
      
      this.logInfo('Reinforcement Of The Army movida para o cemitério após ativação');
    }
    
    // Coletar monstros Warrior de Level 4 ou menos do deck
    const deck = playerField?.deck || [];
    const warriorMonsters: Array<{ monster: any; deckIndex: number }> = [];
    
    deck.forEach((c: any, deckIndex: number) => {
      if (!c) return;
      
      // Verificar se é um monstro
      const cardType = (c.type || c.cardType || '').toString().toUpperCase().trim();
      const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
      if (!isMonster) return;
      
      // Verificar se é Warrior
      const race = (c.race || c.cardRace || '').toString().toUpperCase().trim();
      const isWarrior = race === 'WARRIOR' || race === 'GUERREIRO' || race.includes('WARRIOR');
      if (!isWarrior) return;
      
      // Verificar se é Level 4 ou menos
      const level = Number(c.level || c.cardLevel || 0);
      if (isNaN(level) || level < 1 || level > 4) return;
      
      // Adicionar com o índice real do deck
      warriorMonsters.push({
        ...c,
        deckIndex: deckIndex,
      });
    });
    
    // Se não houver monstros Warrior de Level 4 ou menos no deck, não precisa de escolha
    if (warriorMonsters.length === 0) {
      this.logInfo('Nenhum monstro Warrior de Level 4 ou menos no deck');
      await this.updateDuel(context, {});
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Nenhum monstro Warrior de Level 4 ou menos no deck',
      };
    }
    
    // Atualizar no banco
    await this.updateDuel(context, {});
    
    this.logInfo(`Reinforcement Of The Army: ${warriorMonsters.length} monstros Warrior de Level 4 ou menos encontrados. O gateway deve emitir reinforcementOfTheArmyShowDeck`);
    // O gateway detectará isso e emitirá um evento especial para mostrar os monstros do deck
    
    return {
      success: true,
      createdPendingChoice: false, // Será criado no gateway
      message: `Reinforcement Of The Army: ${warriorMonsters.length} monstros Warrior encontrados no deck`,
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}


