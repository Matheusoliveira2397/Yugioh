import { Injectable } from '@nestjs/common';
import { Duel, TurnPhase } from '../entities/duel.entity';
import { logger } from '../../../common/utils/logger.util';

/**
 * Serviço com funções utilitárias para duelo
 * Separa funções auxiliares do DuelsService principal
 */
@Injectable()
export class DuelUtilsService {
  /**
   * Verifica se uma carta corresponde exatamente a um idCarta específico
   * Prioriza verificação por nome (compartilhado entre skins)
   */
  isExactCard(card: any, exactIdCarta: string): boolean {
    if (!card) return false;
    
    // Priorizar verificação por nome (compartilhado entre skins)
    const cardName = (card.name || card.cardName || '').trim().toLowerCase();
    if (cardName) {
      // Converter idCarta para nome aproximado (ex: "ChangeOfHeart" -> "change of heart")
      const exactNameLower = String(exactIdCarta)
        .replace(/([A-Z])/g, ' $1') // Adicionar espaço antes de maiúsculas
        .trim()
        .toLowerCase();
      
      // Verificar se o nome corresponde (exato ou contém)
      if (cardName === exactNameLower || 
          cardName.includes(exactNameLower) || 
          exactNameLower.includes(cardName)) {
        return true;
      }
    }
    
    // Fallback para idCarta (compatibilidade com cartas antigas)
    const cardId = card.idCarta || card.id || card.cardId;
    if (!cardId) return false;
    
    // Comparação exata do idCarta (case-insensitive)
    const cardIdLower = String(cardId).toLowerCase().trim();
    const exactIdLower = exactIdCarta.toLowerCase().trim();
    
    return cardIdLower === exactIdLower || cardIdLower.includes(exactIdLower);
  }

  /**
   * Normaliza o nome de uma carta para comparação (remove espaços extras, converte para lowercase)
   */
  normalizeCardName(card: any): string {
    if (!card) return '';
    const name = card.name || card.cardName || '';
    return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Normaliza uma string de nome de carta para comparação
   */
  normalizeCardNameString(name: string): string {
    if (!name) return '';
    return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Verifica se duas cartas têm o mesmo nome (normalizado)
   * Cartas com mesmo nome são tratadas como iguais, independente de instanceId
   */
  areCardsSameByName(card1: any, card2: any): boolean {
    if (!card1 || !card2) return false;
    const name1 = this.normalizeCardName(card1);
    const name2 = this.normalizeCardName(card2);
    if (!name1 || !name2) return false;
    return name1 === name2;
  }

  /**
   * Verifica se uma carta corresponde a um nome ou ID específico
   * Prioriza comparação por nome normalizado
   */
  cardMatches(card: any, searchTerm: string | number): boolean {
    if (!card || !searchTerm) return false;
    
    const searchTermStr = String(searchTerm).trim().toLowerCase();
    const searchTermNormalized = this.normalizeCardNameString(searchTermStr);
    
    // Comparar por nome primeiro (cartas com mesmo nome são iguais)
    const cardName = this.normalizeCardName(card);
    if (cardName && searchTermNormalized && cardName === searchTermNormalized) {
      return true;
    }
    
    // Comparar por idCarta/id/cardId/instanceId
    const cardId = card.idCarta || card.id || card.cardId || card.instanceId;
    if (cardId) {
      const cardIdStr = String(cardId).trim().toLowerCase();
      return cardIdStr === searchTermStr || cardIdStr.includes(searchTermStr) || searchTermStr.includes(cardIdStr);
    }
    
    return false;
  }

  /**
   * Busca uma carta em um array usando instanceId (prioritário) ou idCarta/id/cardId/nome
   * Se preferSameName=true, prioriza busca por nome para tratar cartas com mesmo nome como iguais
   */
  findCardInArray(cards: any[], searchCriteria: { instanceId?: string; idCarta?: string; id?: string; cardId?: string; cardName?: string }, preferSameName: boolean = false): any | null {
    if (!cards || !Array.isArray(cards)) return null;
    
    // Se preferSameName=true e temos cardName, buscar por nome primeiro
    if (preferSameName && searchCriteria.cardName) {
      const searchName = this.normalizeCardName({ name: searchCriteria.cardName });
      const found = cards.find((c: any) => {
        if (!c) return false;
        const cName = this.normalizeCardName(c);
        return cName && searchName && cName === searchName;
      });
      if (found) return found;
    }
    
    // Se temos instanceId, buscar por ele primeiro (mais específico)
    if (searchCriteria.instanceId) {
      const found = cards.find((c: any) => c && c.instanceId === searchCriteria.instanceId);
      if (found) return found;
    }
    
    // Se temos idCarta, id ou cardId, buscar por eles
    if (searchCriteria.idCarta || searchCriteria.id || searchCriteria.cardId) {
      const searchId = searchCriteria.idCarta || searchCriteria.id || searchCriteria.cardId;
      const found = cards.find((c: any) => {
        if (!c) return false;
        const cIdCarta = c.idCarta;
        const cId = c.id;
        const cCardId = c.cardId;
        return cIdCarta === searchId || cId === searchId || cCardId === searchId ||
               String(cIdCarta) === String(searchId) || String(cId) === String(searchId) || String(cCardId) === String(searchId);
      });
      if (found) return found;
    }
    
    // Se temos cardName, buscar por nome (normalizado)
    if (searchCriteria.cardName) {
      const searchName = this.normalizeCardName({ name: searchCriteria.cardName });
      const found = cards.find((c: any) => {
        if (!c) return false;
        const cName = this.normalizeCardName(c);
        return cName && searchName && cName === searchName;
      });
      if (found) return found;
    }
    
    return null;
  }

  /**
   * Verifica se Jinzo está no campo (de qualquer jogador)
   */
  isJinzoOnField(duel: Duel): boolean {
    const player1Field = (duel as any).player1Field;
    const player2Field = (duel as any).player2Field;
    
    // Verificar se Jinzo está no campo do Player1
    if (player1Field && player1Field.monsters && Array.isArray(player1Field.monsters)) {
      for (const monster of player1Field.monsters) {
        if (monster && monster !== null) {
          if (this.isExactCard(monster, 'Jinzo')) {
            logger.info(`🤖 [DuelUtilsService] Jinzo encontrado no campo do Player1`);
            return true;
          }
        }
      }
    }
    
    // Verificar se Jinzo está no campo do Player2
    if (player2Field && player2Field.monsters && Array.isArray(player2Field.monsters)) {
      for (const monster of player2Field.monsters) {
        if (monster && monster !== null) {
          if (this.isExactCard(monster, 'Jinzo')) {
            logger.info(`🤖 [DuelUtilsService] Jinzo encontrado no campo do Player2`);
            return true;
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Verifica se MirageDragon está no campo do oponente durante a Fase de Batalha
   * MirageDragon impede que o oponente ative traps durante a Fase de Batalha
   */
  isMirageDragonBlockingTraps(duel: Duel, isPlayer1: boolean): boolean {
    // MirageDragon só bloqueia traps durante a Fase de Batalha
    const currentPhase = duel.currentPhase as string;
    if (currentPhase !== TurnPhase.BATTLE && currentPhase !== 'BATTLE') {
      return false;
    }
    
    // O oponente do jogador que está tentando ativar a trap
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    if (!opponentField || !opponentField.monsters || !Array.isArray(opponentField.monsters)) {
      return false;
    }
    
    // Verificar se MirageDragon está no campo do oponente (face-up)
    for (const monster of opponentField.monsters) {
      if (monster && monster !== null) {
        const monsterId = monster.idCarta || monster.id || monster.cardId;
        const monsterPosition = monster.position || 'set';
        
        // MirageDragon deve estar face-up (attack ou defense)
        if ((monsterPosition === 'attack' || monsterPosition === 'defense') &&
            (this.isExactCard(monster, 'MirageDragon') ||
             monsterId === 'MirageDragon' ||
             String(monsterId).toLowerCase().includes('miragedragon'))) {
          logger.info(`🐉 [DuelUtilsService] Mirage Dragon encontrado no campo do oponente - traps bloqueadas`);
          return true;
        }
      }
    }
    
    return false;
  }
}

