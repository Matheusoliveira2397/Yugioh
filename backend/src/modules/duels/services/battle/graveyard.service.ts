import { Injectable } from '@nestjs/common';
import { logger } from '../../../../common/utils/logger.util';

/**
 * Serviço responsável por gerenciamento de cemitério
 * Separa a lógica de cemitério do DuelsService principal
 * 
 * Responsabilidades:
 * - Adicionar cartas ao cemitério
 * - Remover cartas do cemitério
 * - Buscar cartas no cemitério
 * - Gerenciar estado do cemitério
 */
@Injectable()
export class GraveyardService {
  /**
   * Adiciona uma carta ao cemitério
   * @param graveyard - Array do cemitério
   * @param card - Carta a ser adicionada
   */
  addToGraveyard(graveyard: any[], card: any): void {
    if (!graveyard) {
      logger.warn(`⚠️ [GraveyardService] Tentativa de adicionar carta a cemitério nulo`);
      return;
    }

    graveyard.push(card);
    logger.info(`✅ [GraveyardService] Carta adicionada ao cemitério: ${card.name || card.cardName || 'Desconhecida'}`);
  }

  /**
   * Remove uma carta do cemitério
   * @param graveyard - Array do cemitério
   * @param cardIndex - Índice da carta a ser removida
   * @returns Carta removida ou null
   */
  removeFromGraveyard(graveyard: any[], cardIndex: number): any | null {
    if (!graveyard || cardIndex < 0 || cardIndex >= graveyard.length) {
      return null;
    }

    const card = graveyard.splice(cardIndex, 1)[0];
    logger.info(`✅ [GraveyardService] Carta removida do cemitério: ${card?.name || card?.cardName || 'Desconhecida'}`);
    return card;
  }

  /**
   * Busca uma carta no cemitério por critério
   * @param graveyard - Array do cemitério
   * @param predicate - Função de busca
   * @returns Carta encontrada ou null
   */
  findInGraveyard(graveyard: any[], predicate: (card: any) => boolean): any | null {
    if (!graveyard) {
      return null;
    }

    return graveyard.find(predicate) || null;
  }

  /**
   * Conta cartas no cemitério que atendem a um critério
   * @param graveyard - Array do cemitério
   * @param predicate - Função de contagem
   * @returns Número de cartas
   */
  countInGraveyard(graveyard: any[], predicate: (card: any) => boolean): number {
    if (!graveyard) {
      return 0;
    }

    return graveyard.filter(predicate).length;
  }
}

