import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseCardEffect } from '../base/card-effect.base';
import { CardEffectContext, CardEffectResult } from '../interfaces/card-effect.interface';
import { DuelsService } from '../../../duels.service';
import { DuelUtilsService } from '../../duel-utils.service';

/**
 * Efeito da carta Change Of Heart
 * 
 * EFEITO: Controlar um monstro do oponente durante o turno
 * 
 * IMPORTANTE: Este arquivo NÃO deve ser modificado após estar funcionando.
 */
@Injectable()
export class ChangeOfHeartEffect extends BaseCardEffect {
  readonly cardNames = ['change of heart'];
  readonly cardIds = ['ChangeOfHeart'];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    duelsService: DuelsService,
    duelUtils: DuelUtilsService,
  ) {
    super(duelsService, duelUtils);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    this.logInfo('Change Of Heart ativada - requer escolha do jogador');
    this.logInfo('Change Of Heart permanecerá no campo até o turno acabar ou ser destruída');
    
    const opponentField = this.getOpponentField(context);
    
    // Coletar monstros do campo do oponente (qualquer posição: attack, defense ou set)
    // EXCETO Mataza The Zapper quando está face-up (não pode ser controlada)
    const opponentMonstersWithIndices: Array<{ monster: any; zoneIndex: number }> = [];
    (opponentField?.monsters || []).forEach((m: any, index: number) => {
      if (m && m !== null && m !== undefined) {
        // Verificar se é Mataza The Zapper face-up (não pode ser controlada)
        const monsterCardId = m.idCarta || m.id || m.cardId;
        const monsterName = (m.name || m.cardName || '').toLowerCase();
        const isMatazaTheZapper = monsterCardId === 'MatazaTheZapper' || 
                                  monsterCardId === 'matazathezapper' ||
                                  monsterName === 'mataza the zapper' ||
                                  monsterName === 'matazathezapper' ||
                                  this.duelUtils.isExactCard(m, 'MatazaTheZapper');
        const position = m.position || 'attack';
        const isFaceUp = position === 'attack' || position === 'defense';
        
        // Se for Mataza The Zapper face-up, não pode ser controlada
        if (isMatazaTheZapper && isFaceUp) {
          this.logInfo('Mataza The Zapper está face-up e não pode ser controlada');
          return; // Pular este monstro
        }
        
        // Pode controlar monstros em qualquer posição (attack, defense ou set)
        opponentMonstersWithIndices.push({ monster: m, zoneIndex: index });
      }
    });
    
    const opponentMonsters = opponentMonstersWithIndices.map((om: any) => ({
      ...om.monster,
      zoneIndex: om.zoneIndex, // Incluir zoneIndex no objeto do monstro
    }));
    
    // Se não houver monstros no campo do oponente, não precisa de escolha
    if (opponentMonsters.length === 0) {
      this.logInfo('Nenhum monstro no campo do oponente para controlar');
      await this.updateDuel(context, {});
      return {
        success: false,
        createdPendingChoice: false,
        message: 'Nenhum monstro no campo do oponente para controlar',
      };
    }
    
    // IMPORTANTE: ChangeOfHeart não cria pendingChoice - o frontend gerencia o estado temporário
    this.logInfo('Change Of Heart: Frontend gerenciará o estado temporário - não criando pendingChoice');
    
    // Atualizar no banco
    await this.updateDuel(context, {});
    
    this.logInfo('Change Of Heart: O gateway deve emitir changeOfHeartShowOpponentMonsters');
    // O gateway detectará isso e emitirá um evento especial para mostrar os monstros do oponente
    
    return {
      success: true,
      createdPendingChoice: false, // Frontend gerencia
      message: 'Change Of Heart aguardando seleção de monstro do oponente',
    };
  }

  needsPlayerChoice(context: CardEffectContext): boolean {
    return true;
  }
}


