import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../../interfaces/card-effect.interface';
import { DuelsService } from '../../../../duels.service';
import { DuelUtilsService } from '../../../duel-utils.service';

/**
 * Megamorph (YGOPRO_22046459)
 * While your LP lower than opp: equipped ATK becomes double original.
 * While higher: half original.
 */
@Injectable()
export class MegamorphEffect extends BaseCardEffect {
  readonly cardNames = ['megamorph'];
  readonly cardIds = ['Megamorph', 'YGOPRO_22046459'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Megamorph ativado');
    
    const { duelId, duel, isPlayer1, zoneIndex, selectedMonsterZoneIndex } = context;
    const playerField = this.getPlayerField(context);
    const card = context.card;
    const cardId = card.idCarta || card.id || card.cardId;
    
    // If monster already selected
    if (selectedMonsterZoneIndex !== undefined) {
      const chosenMonster = playerField?.monsters?.[selectedMonsterZoneIndex];
      if (chosenMonster && (chosenMonster.position === 'attack' || chosenMonster.position === 'defense')) {
        // Equip
        if (!chosenMonster.equippedCards || !Array.isArray(chosenMonster.equippedCards)) {
          chosenMonster.equippedCards = [];
        }
        
        const cardInstanceId = card.instanceId;
        const uniqueEquipRef = cardInstanceId 
          ? `${cardId}:${zoneIndex}:${cardInstanceId}`
          : `${cardId}:${zoneIndex}`;
        
        if (!chosenMonster.equippedCards.includes(uniqueEquipRef)) {
          chosenMonster.equippedCards.push(uniqueEquipRef);
        }
        
        chosenMonster.equippedCardId = cardId;
        chosenMonster.equippedSpellTrapZoneIndex = zoneIndex;
        
        // Mark as having Megamorph
        chosenMonster.hasMegamorph = true;
        
        this.logInfo(`Megamorph equipado (ATK will be calculated dynamically based on LP)`);
        
        await this.updateDuel(context, {});
        
        return {
          success: true,
          createdPendingChoice: false,
          message: 'Megamorph equipado',
        };
      }
    }
    
    // Create pending choice
    const availableMonsters: any[] = [];
    if (playerField?.monsters) {
      playerField.monsters.forEach((monster: any, index: number) => {
        if (monster && (monster.position === 'attack' || monster.position === 'defense')) {
          availableMonsters.push({
            ...monster,
            zoneIndex: index
          });
        }
      });
    }
    
    if (availableMonsters.length === 0) {
      this.logInfo('Megamorph: Nenhum monstro face-up disponível');
      if (playerField?.spellTrap?.[zoneIndex]) {
        if (!playerField.graveyard) playerField.graveyard = [];
        playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
        playerField.spellTrap[zoneIndex] = null;
      }
      await this.updateDuel(context, {});
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Megamorph: Nenhum alvo válido',
      };
    }
    
    await this.updateDuel(context, {});
    
    await (this.duelsService as any).setPendingChoice(duelId, {
      type: 'MEGAMORPH',
      userId: isPlayer1 ? Number(duel.player1Id) : Number(duel.player2Id),
      turnWhenStarted: duel.currentTurn,
      phaseWhenStarted: duel.currentPhase || 'MAIN1',
      data: {
        availableMonsters,
        spellTrapZoneIndex: zoneIndex,
      }
    });
    
    return {
      success: true,
      createdPendingChoice: true,
      message: 'Megamorph aguardando seleção de monstro',
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}
