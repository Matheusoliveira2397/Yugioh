import { Duel } from '../../../entities/duel.entity';
import { exactCardMatch } from '../utils/card-key.util';

/**
 * Contexto necessário para processar um efeito de carta
 */
export interface CardEffectContext {
  duelId: string | number;
  duel: Duel;
  isPlayer1: boolean;
  card: any;
  zoneIndex: number;
  selectedMonsterZoneIndex?: number;
  userId?: number;
}

/**
 * Resultado do processamento de um efeito
 */
export interface CardEffectResult {
  success: boolean;
  createdPendingChoice?: boolean;
  message?: string;
  data?: any;
}

/**
 * Tipo para função de efeito simples
 * Para efeitos básicos, apenas uma função é suficiente
 */
export type SimpleCardEffectFunction = (context: CardEffectContext) => Promise<CardEffectResult> | CardEffectResult;

/**
 * Interface base para todos os efeitos de cartas
 * 
 * IMPORTANTE: Você pode usar:
 * 1. Uma função simples (SimpleCardEffectFunction) para efeitos básicos
 * 2. Uma classe completa (ICardEffect) para efeitos complexos
 */
export interface ICardEffect {
  /**
   * Identificadores da carta (nome e idCarta)
   * Usado para identificar qual efeito processar
   */
  readonly cardNames: string[];
  readonly cardIds?: string[];

  /**
   * Verifica se esta carta corresponde ao identificador fornecido
   */
  matches(card: any): boolean;

  /**
   * Processa o efeito da carta
   * @param context Contexto do duelo e da carta
   * @returns Resultado do processamento
   */
  process(context: CardEffectContext): Promise<CardEffectResult> | CardEffectResult;

  /**
   * Verifica se o efeito pode ser ativado nas condições atuais
   * @param context Contexto do duelo e da carta
   * @returns true se pode ser ativado, false caso contrário
   */
  canActivate?(context: CardEffectContext): Promise<boolean> | boolean;

  /**
   * Verifica se precisa de escolha do jogador antes de processar
   * @param context Contexto do duelo e da carta
   * @returns true se precisa de escolha, false caso contrário
   */
  needsPlayerChoice?(context: CardEffectContext): Promise<boolean> | boolean;
}

/**
 * Wrapper para transformar função simples em ICardEffect
 * Permite usar funções simples como se fossem classes
 */
export class SimpleCardEffectWrapper implements ICardEffect {
  constructor(
    public readonly cardNames: string[],
    public readonly effectFunction: SimpleCardEffectFunction,
    public readonly cardIds?: string[],
  ) {}

  matches(card: any): boolean {
    return exactCardMatch(card, this.cardNames, this.cardIds);
  }

  async process(context: CardEffectContext): Promise<CardEffectResult> {
    return await this.effectFunction(context);
  }
}
