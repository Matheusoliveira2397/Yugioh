import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../../interfaces/card-effect.interface';
import { DuelsService } from '../../../../duels.service';
import { DuelUtilsService } from '../../../duel-utils.service';

/**
 * Magic Formula (YGOPRO_67227834)
 * Equip only to Dark Magician or Dark Magician Girl. +700 ATK.
 * If sent from field to GY: gain 1000 LP.
 */
@Injectable()
export class MagicFormulaEffect extends BaseCardEffect {
  readonly cardNames = ['magic formula', 'magicformula'];
  readonly cardIds = ['MagicFormula', 'YGOPRO_67227834'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Magic Formula ativado');
    
    const { duelId, duel, isPlayer1, zoneIndex, selectedMonsterZoneIndex } = context;
    const playerField = this.getPlayerField(context);
    const card = context.card;
    const cardId = card.idCarta || card.id || card.cardId;
    
    // If monster already selected
    if (selectedMonsterZoneIndex !== undefined) {
      const chosenMonster = playerField?.monsters?.[selectedMonsterZoneIndex];
      if (chosenMonster && (chosenMonster.position === 'attack' || chosenMonster.position === 'defense')) {
        // Verify it's DM or DMG
        const name = (chosenMonster.name || chosenMonster.cardName || '').toLowerCase().replace(/\s+|'/g, '');
        const isDMorDMG = name.includes('darkmagician') || name.includes('magonegro') || 
                          name.includes('darkmagiciangirl') || name.includes('pequenamaganegra');
        
        if (!isDMorDMG) {
          this.logInfo('Magic Formula: Alvo inválido (não é DM ou DMG)');
          if (playerField?.spellTrap?.[zoneIndex]) {
            if (!playerField.graveyard) playerField.graveyard = [];
            playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
            playerField.spellTrap[zoneIndex] = null;
          }
          await this.updateDuel(context, {});
          return {
            success: false,
            createdPendingChoice: false,
            message: 'Magic Formula: Só pode equipar em Dark Magician/Dark Magician Girl',
          };
        }
        
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
        
        // +700 ATK bonus
        chosenMonster.equipmentBonusAtk = (chosenMonster.equipmentBonusAtk || 0) + 700;
        
        this.logInfo(`Magic Formula equipado: +700 ATK`);
        
        await this.updateDuel(context, {});
        
        return {
          success: true,
          createdPendingChoice: false,
          message: 'Magic Formula equipado (+700 ATK)',
        };
      }
    }
    
    // Create pending choice
    const availableMonsters: any[] = [];
    if (playerField?.monsters) {
      playerField.monsters.forEach((monster: any, index: number) => {
        if (monster && (monster.position === 'attack' || monster.position === 'defense')) {
          const name = (monster.name || monster.cardName || '').toLowerCase().replace(/\s+|'/g, '');
          const isDMorDMG = name.includes('darkmagician') || name.includes('magonegro') || 
                            name.includes('darkmagiciangirl') || name.includes('pequenamaganegra');
          if (isDMorDMG) {
            availableMonsters.push({
              ...monster,
              zoneIndex: index
            });
          }
        }
      });
    }
    
    if (availableMonsters.length === 0) {
      this.logInfo('Magic Formula: Nenhum DM/DMG disponível');
      if (playerField?.spellTrap?.[zoneIndex]) {
        if (!playerField.graveyard) playerField.graveyard = [];
        playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
        playerField.spellTrap[zoneIndex] = null;
      }
      await this.updateDuel(context, {});
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Magic Formula: Requer Dark Magician ou Dark Magician Girl',
      };
    }
    
    await this.updateDuel(context, {});
    
    await (this.duelsService as any).setPendingChoice(duelId, {
      type: 'MAGIC_FORMULA',
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
      message: 'Magic Formula aguardando seleção de monstro',
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}
