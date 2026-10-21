import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ICardEffect, CardEffectContext, CardEffectResult } from '../interfaces/card-effect.interface';
import { DuelsService } from '../../../duels.service';
import { DuelUtilsService } from '../../duel-utils.service';
import { logger } from '../../../../../common/utils/logger.util';
import { exactCardMatch } from '../utils/card-key.util';

/**
 * Classe base abstrata para efeitos de cartas
 * Fornece funcionalidades comuns e garante consistência
 * 
 * IMPORTANTE: Cada carta deve ter sua própria classe que estende esta base.
 * NÃO edite um efeito que já funciona para “ajustar outro” — crie arquivo novo.
 * Match é SEMPRE exato (anti-regressão).
 */
@Injectable()
export abstract class BaseCardEffect implements ICardEffect {
  abstract readonly cardNames: string[];
  abstract readonly cardIds?: string[];

  constructor(
    @Inject(forwardRef(() => DuelsService))
    protected readonly duelsService: DuelsService,
    protected readonly duelUtils: DuelUtilsService,
  ) {
    // Garantir que as dependências foram injetadas
    if (!duelsService) {
      throw new Error(`${this.constructor.name}: DuelsService não foi injetado`);
    }
    if (!duelUtils) {
      throw new Error(`${this.constructor.name}: DuelUtilsService não foi injetado`);
    }
  }

  /**
   * Match EXATO por nome/id — nunca parcial (evita efeito A roubar carta B)
   */
  matches(card: any): boolean {
    return exactCardMatch(card, this.cardNames, this.cardIds);
  }

  /**
   * Processa o efeito da carta
   * Deve ser implementado por cada carta específica
   */
  abstract process(context: CardEffectContext): Promise<CardEffectResult>;

  /**
   * Verifica se o efeito pode ser ativado
   * Implementação padrão retorna true, pode ser sobrescrita
   */
  canActivate(context: CardEffectContext): boolean {
    return true;
  }

  /**
   * Verifica se precisa de escolha do jogador
   * Implementação padrão retorna false, pode ser sobrescrita
   */
  needsPlayerChoice(context: CardEffectContext): boolean {
    return false;
  }

  /**
   * Métodos auxiliares comuns para todos os efeitos
   */

  protected getPlayerField(context: CardEffectContext): any {
    return context.isPlayer1 
      ? (context.duel as any).player1Field 
      : (context.duel as any).player2Field;
  }

  protected getOpponentField(context: CardEffectContext): any {
    return context.isPlayer1 
      ? (context.duel as any).player2Field 
      : (context.duel as any).player1Field;
  }

  protected getPlayerId(context: CardEffectContext): number {
    return context.isPlayer1 ? context.duel.player1Id : context.duel.player2Id;
  }

  protected getOpponentId(context: CardEffectContext): number {
    return context.isPlayer1 ? context.duel.player2Id : context.duel.player1Id;
  }

  /**
   * CRÍTICO: Atualiza o duelo sincronizando cache e banco
   * Garante que efeitos não sejam perdidos
   */
  protected async updateDuel(context: CardEffectContext, updates: Partial<any>): Promise<void> {
    // Atualizar o objeto do duelo com as mudanças
    const updatedDuel = {
      ...context.duel,
      ...updates,
      player1Field: updates.player1Field || (context.duel as any).player1Field,
      player2Field: updates.player2Field || (context.duel as any).player2Field,
    };
    
    // Usar syncDuelState para garantir sincronização entre cache e banco
    await (this.duelsService as any).syncDuelState(context.duelId, updatedDuel, {
      player1Field: (updatedDuel as any).player1Field,
      player2Field: (updatedDuel as any).player2Field,
      ...updates,
    });
  }

  protected logInfo(message: string, context?: any): void {
    logger.info(`✨ [${this.constructor.name}] ${message}`, context);
  }

  protected logError(message: string, error?: any): void {
    logger.error(`❌ [${this.constructor.name}] ${message}`, error);
  }

  protected logWarn(message: string, context?: any): void {
    logger.warn(`⚠️ [${this.constructor.name}] ${message}`, context);
  }
}

