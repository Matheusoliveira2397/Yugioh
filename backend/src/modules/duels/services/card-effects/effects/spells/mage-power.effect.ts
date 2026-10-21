import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../../interfaces/card-effect.interface';
import { DuelsService } from '../../../../duels.service';
import { DuelUtilsService } from '../../../duel-utils.service';

/**
 * Efeito da carta Mage Power
 * 
 * EFEITO: Magia de Equipamento: Escolher um monstro para equipar, ganha 500 ATK por cada carta na zona de spell/trap
 * 
 * IMPORTANTE: Este arquivo NÃO deve ser modificado após estar funcionando.
 */
@Injectable()
export class MagePowerEffect extends BaseCardEffect {
  readonly cardNames = ['mage power'];
  readonly cardIds = ['MagePower'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Mage Power ativada');
    
    const { duelId, duel, isPlayer1, zoneIndex, selectedMonsterZoneIndex } = context;
    const playerField = this.getPlayerField(context);
    const card = context.card;
    const cardId = card.idCarta || card.id || card.cardId;
    
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
        // Contar cartas na zona de spell/trap do jogador
        if (!playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
          playerField.spellTrap = [null, null, null, null, null];
        }
        while (playerField.spellTrap.length < 5) {
          playerField.spellTrap.push(null);
        }
        playerField.spellTrap = playerField.spellTrap.slice(0, 5);
        
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
          this.logInfo(`Mage Power adicionada ao monstro. Total de equips: ${chosenMonster.equippedCards.length}`);
        } else {
          this.logInfo('Mage Power já está equipada neste monstro');
        }
        
        chosenMonster.equippedCardId = cardId;
        chosenMonster.equippedSpellTrapZoneIndex = zoneIndex;
        
        // Recalcular bônus total do equipamento (+500 ATK e +500 DEF por Spell/Trap)
        chosenMonster.equipmentBonusAtk = (this.duelsService as any).calculateTotalEquipmentBonus(chosenMonster, playerField);
        chosenMonster.equipmentBonusDef = (this.duelsService as any).calculateTotalEquipmentBonusDef(chosenMonster, playerField);
        
        this.logInfo(`Mage Power equipada ao monstro na zona ${selectedMonsterZoneIndex}, bonus ATK: +${chosenMonster.equipmentBonusAtk}, DEF: +${chosenMonster.equipmentBonusDef || 0}`);
        
        // Atualizar no banco e cache para garantir que o estado está salvo
        await this.updateDuel(context, {});
        
        return {
          success: true,
          createdPendingChoice: false,
          message: `Mage Power equipada ao monstro`,
        };
      }
    }
    
    // Se não foi selecionado via drag and drop, criar pending choice
    this.logInfo('Mage Power ativada - requer escolha do monstro para equipar');
    
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
      this.logInfo('Nenhum monstro face-up disponível para equipar Mage Power');
      // Ainda assim, deixar a carta no campo (pode equipar depois quando houver monstros)
      await this.updateDuel(context, {});
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Nenhum monstro face-up disponível para equipar',
      };
    }
    
    this.logInfo(`Mage Power: ${availableMonsters.length} monstro(s) disponível(is) para equipar`);
    
    // Atualizar no banco
    await this.updateDuel(context, {});
    
    // Salvar pending choice
    await (this.duelsService as any).setPendingChoice(duelId, {
      type: 'MAGE_POWER',
      userId: isPlayer1 ? Number(duel.player1Id) : Number(duel.player2Id),
      turnWhenStarted: duel.currentTurn,
      phaseWhenStarted: duel.currentPhase || 'MAIN1',
      data: {
        availableMonsters: availableMonsters, // Já inclui zoneIndex em cada monstro
        spellTrapZoneIndex: zoneIndex, // Índice da zona onde Mage Power está
      }
    });
    
    this.logInfo('Mage Power: O gateway deve emitir magePowerShowMonsters');
    // O gateway detectará isso e emitirá um evento especial para mostrar os monstros disponíveis
    
    return {
      success: true,
      createdPendingChoice: false, // Será criado no gateway
      message: 'Mage Power aguardando seleção de monstro para equipar',
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}


