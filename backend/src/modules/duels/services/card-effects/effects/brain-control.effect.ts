import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../interfaces/card-effect.interface';
import { DuelsService } from '../../../duels.service';
import { DuelUtilsService } from '../../duel-utils.service';

/**
 * Efeito da carta Brain Control
 * 
 * EFEITO: Controlar um monstro face-up do oponente durante o turno (custo: 800 LP)
 * 
 * IMPORTANTE: Este arquivo NÃO deve ser modificado após estar funcionando.
 */
@Injectable()
export class BrainControlEffect extends BaseCardEffect {
  readonly cardNames = ['brain control'];
  readonly cardIds = ['BrainControl'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Brain Control ativada - requer escolha do jogador e pagamento de 800 LP');
    this.logInfo('Brain Control permanecerá no campo até o turno acabar ou ser destruída');
    
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    
    // Verificar se o jogador tem LP suficientes (800)
    const currentLP = isPlayer1 ? duel.player1LifePoints : duel.player2LifePoints;
    if (currentLP < 800) {
      this.logInfo(`Jogador não tem LP suficientes (${currentLP} < 800)`);
      // Mover Brain Control para o cemitério já que não pode ser usada
      const playerField = this.getPlayerField(context);
      if (playerField?.spellTrap?.[zoneIndex]) {
        const activatedCard = playerField.spellTrap[zoneIndex];
        if (!playerField.graveyard) {
          playerField.graveyard = [];
        }
        playerField.graveyard.push(activatedCard);
        playerField.spellTrap[zoneIndex] = null;
      }
      await this.updateDuel(context, {
        player1LifePoints: duel.player1LifePoints,
        player2LifePoints: duel.player2LifePoints,
      });
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Jogador não tem LP suficientes (800)',
      };
    }
    
    // Reduzir 800 LP do jogador
    if (isPlayer1) {
      duel.player1LifePoints = Math.max(0, duel.player1LifePoints - 800);
      this.logInfo(`Player 1 pagou 800 LP. LP restante: ${duel.player1LifePoints}`);
    } else {
      duel.player2LifePoints = Math.max(0, duel.player2LifePoints - 800);
      this.logInfo(`Player 2 pagou 800 LP. LP restante: ${duel.player2LifePoints}`);
    }
    
    // Verificar se o jogador perdeu por LP
    if (duel.player1LifePoints <= 0 || duel.player2LifePoints <= 0) {
      const winnerId = duel.player1LifePoints <= 0 ? duel.player2Id : duel.player1Id;
      await (this.duelsService as any).updateDuelInDatabase(duelId, {
        status: 'FINISHED',
        winnerId: winnerId,
        player1LifePoints: duel.player1LifePoints,
        player2LifePoints: duel.player2LifePoints,
      } as any);
      (this.duelsService as any).activeDuels.set(duelId, duel);
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Jogador perdeu por LP',
      };
    }
    
    // NÃO mover Brain Control para o cemitério imediatamente - ela fica no campo
    const opponentField = this.getOpponentField(context);
    
    // Coletar apenas monstros FACE-UP do campo do oponente (attack ou defense, NÃO set)
    // EXCETO Mataza The Zapper quando está face-up (não pode ser controlada)
    const opponentMonstersWithIndices: Array<{ monster: any; zoneIndex: number }> = [];
    (opponentField?.monsters || []).forEach((m: any, index: number) => {
      if (m && m !== null && m !== undefined) {
        // Só pode controlar monstros face-up (attack ou defense, não set/face-down)
        const position = m.position || 'attack';
        if (position === 'attack' || position === 'defense') {
          // Verificar se é Mataza The Zapper face-up (não pode ser controlada)
          const monsterCardId = m.idCarta || m.id || m.cardId;
          const monsterName = (m.name || m.cardName || '').toLowerCase();
          const isMatazaTheZapper = monsterCardId === 'MatazaTheZapper' || 
                                    monsterCardId === 'matazathezapper' ||
                                    monsterName === 'mataza the zapper' ||
                                    monsterName === 'matazathezapper' ||
                                    this.duelUtils.isExactCard(m, 'MatazaTheZapper');
          
          // Se for Mataza The Zapper face-up, não pode ser controlada
          if (isMatazaTheZapper) {
            this.logInfo('Mataza The Zapper está face-up e não pode ser controlada');
            return; // Pular este monstro
          }
          
          opponentMonstersWithIndices.push({ monster: m, zoneIndex: index });
        }
      }
    });
    
    const opponentMonsters = opponentMonstersWithIndices.map((om: any) => ({
      ...om.monster,
      zoneIndex: om.zoneIndex, // Incluir zoneIndex no objeto do monstro
    }));
    
    // Se não houver monstros face-up no campo do oponente, não precisa de escolha
    if (opponentMonsters.length === 0) {
      this.logInfo('Nenhum monstro face-up no campo do oponente para controlar');
      await this.updateDuel(context, {
        player1LifePoints: duel.player1LifePoints,
        player2LifePoints: duel.player2LifePoints,
      });
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Nenhum monstro face-up no campo do oponente para controlar',
      };
    }
    
    // Atualizar no banco
    await this.updateDuel(context, {
      player1LifePoints: duel.player1LifePoints,
      player2LifePoints: duel.player2LifePoints,
    });
    
    // Salvar pending choice
    await (this.duelsService as any).setPendingChoice(duelId, {
      type: 'BRAIN_CONTROL',
      userId: isPlayer1 ? Number(duel.player1Id) : Number(duel.player2Id),
      turnWhenStarted: duel.currentTurn,
      phaseWhenStarted: duel.currentPhase || 'MAIN1',
      data: {
        opponentMonsters: opponentMonsters, // Já inclui zoneIndex em cada monstro
      }
    });
    
    this.logInfo('Brain Control: O gateway deve emitir brainControlShowOpponentMonsters');
    // O gateway detectará isso e emitirá um evento especial para mostrar os monstros do oponente
    
    return {
      success: true,
      createdPendingChoice: true, // Criou pendingChoice
      message: 'Brain Control aguardando seleção de monstro face-up do oponente',
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}


