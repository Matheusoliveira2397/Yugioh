import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../interfaces/card-effect.interface';
import { DuelsService } from '../../../duels.service';
import { DuelUtilsService } from '../../duel-utils.service';

/**
 * Efeito da carta United We Stand
 * 
 * EFEITO: Magia de Equipamento: Escolher um monstro para equipar, ganha 800 ATK por cada monstro face-up no campo
 * 
 * IMPORTANTE: Este arquivo NÃO deve ser modificado após estar funcionando.
 */
@Injectable()
export class UnitedWeStandEffect extends BaseCardEffect {
  readonly cardNames = ['united we stand', 'unitedwestand'];
  readonly cardIds = ['UnitedWeStand', 'unitedwestand'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('United We Stand ativada - spell Equip, permanecerá no campo');
    
    const { duelId, duel, isPlayer1, zoneIndex, selectedMonsterZoneIndex } = context;
    const playerField = this.getPlayerField(context);
    const card = context.card;
    const cardId = card.idCarta || card.id || card.cardId;
    
    // GARANTIR que a carta está no campo e não será movida para o cemitério
    if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
      const cardOnField = playerField.spellTrap[zoneIndex];
      const cardOnFieldId = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
      if (cardOnFieldId === cardId || String(cardOnFieldId) === String(cardId)) {
        // Garantir que a posição está como 'face-up' (ativada)
        cardOnField.position = 'face-up';
        this.logInfo(`United We Stand confirmada no campo na zona ${zoneIndex} em face-up`);
      }
    }
    
    if (!playerField || !playerField.monsters) {
      this.logInfo('Campo do jogador não encontrado');
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Campo do jogador não encontrado',
      };
    }
    
    // Se o monstro já foi selecionado (via drag and drop), equipar diretamente
    if (selectedMonsterZoneIndex !== undefined && selectedMonsterZoneIndex !== null) {
      const chosenMonster = playerField.monsters[selectedMonsterZoneIndex];
      if (chosenMonster && (chosenMonster.position === 'attack' || chosenMonster.position === 'defense')) {
        // Inicializar array de equips apenas se não existir (manter equipamentos anteriores)
        if (!chosenMonster.equippedCards || !Array.isArray(chosenMonster.equippedCards)) {
          chosenMonster.equippedCards = [];
        }
        
        // Criar referência única para este equipamento: cardId:zoneIndex
        const cardInstanceId = card.instanceId;
        const uniqueEquipRef = cardInstanceId 
          ? `${cardId}:${zoneIndex}:${cardInstanceId}`
          : `${cardId}:${zoneIndex}`;
        
        // Verificar se este equipamento já está no array (evitar duplicatas)
        if (!chosenMonster.equippedCards.includes(uniqueEquipRef)) {
          chosenMonster.equippedCards.push(uniqueEquipRef);
          this.logInfo(`United We Stand adicionada ao monstro. Total de equips: ${chosenMonster.equippedCards.length}`);
        } else {
          this.logInfo('United We Stand já está equipada neste monstro');
        }
        
        chosenMonster.equippedCardId = cardId;
        chosenMonster.equippedSpellTrapZoneIndex = zoneIndex;
        
        // Recalcular bônus total do equipamento (+800 ATK e +800 DEF por monstro face-up)
        chosenMonster.equipmentBonusAtk = (this.duelsService as any).calculateTotalEquipmentBonus(chosenMonster, playerField);
        chosenMonster.equipmentBonusDef = (this.duelsService as any).calculateTotalEquipmentBonusDef(chosenMonster, playerField);
        
        this.logInfo(`United We Stand equipada ao monstro na zona ${selectedMonsterZoneIndex}, bonus ATK: +${chosenMonster.equipmentBonusAtk}, DEF: +${chosenMonster.equipmentBonusDef || 0}`);
        
        // Atualizar no banco e cache para garantir que o estado está salvo
        await this.updateDuel(context, {});
        
        return {
          success: true,
          createdPendingChoice: false,
          message: `United We Stand equipada ao monstro`,
        };
      }
    }
    
    // Se não foi selecionado via drag and drop, criar pending choice
    this.logInfo('United We Stand ativada - requer escolha do monstro para equipar');
    
    // Coletar todos os monstros face-up do jogador (attack ou defense, não set)
    const availableMonsters: any[] = [];
    playerField.monsters.forEach((monster: any, index: number) => {
      if (monster && (monster.position === 'attack' || monster.position === 'defense')) {
        availableMonsters.push({
          ...monster,
          zoneIndex: index
        });
      }
    });
    
    if (availableMonsters.length === 0) {
      this.logInfo('Nenhum monstro face-up disponível para equipar United We Stand');
      // Ainda assim, deixar a carta no campo (pode equipar depois quando houver monstros)
      await this.updateDuel(context, {});
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Nenhum monstro face-up disponível para equipar',
      };
    }
    
    this.logInfo(`United We Stand: ${availableMonsters.length} monstro(s) disponível(is) para equipar`);
    
    // Atualizar no banco
    await this.updateDuel(context, {});
    
    // Salvar pending choice
    await (this.duelsService as any).setPendingChoice(duelId, {
      type: 'UNITED_WE_STAND',
      userId: isPlayer1 ? Number(duel.player1Id) : Number(duel.player2Id),
      turnWhenStarted: duel.currentTurn,
      phaseWhenStarted: duel.currentPhase || 'MAIN1',
      data: {
        availableMonsters: availableMonsters, // Já inclui zoneIndex em cada monstro
        spellTrapZoneIndex: zoneIndex, // Índice da zona onde United We Stand está
      }
    });
    
    this.logInfo('United We Stand: O gateway deve emitir unitedWeStandShowMonsters');
    // O gateway detectará isso e emitirá um evento especial para mostrar os monstros disponíveis
    
    // IMPORTANTE: Garantir que United We Stand permanece no campo (não vai para o cemitério)
    if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
      const cardOnField = playerField.spellTrap[zoneIndex];
      const cardOnFieldId = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
      if (cardOnFieldId === cardId || String(cardOnFieldId) === String(cardId)) {
        cardOnField.position = 'face-up';
        this.logInfo(`United We Stand confirmada no campo na zona ${zoneIndex} - NÃO será movida para o cemitério`);
      }
    }
    
    // Atualizar no banco para garantir que o estado está correto
    await this.updateDuel(context, {});
    
    return {
      success: true,
      createdPendingChoice: false, // Será criado no gateway
      message: 'United We Stand aguardando seleção de monstro para equipar',
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}


