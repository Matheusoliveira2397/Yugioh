import { Injectable, Type, Inject, forwardRef } from '@nestjs/common';
import { ICardEffect, SimpleCardEffectFunction, SimpleCardEffectWrapper } from '../interfaces/card-effect.interface';
import { logger } from '../../../../../common/utils/logger.util';
import { DuelsService } from '../../../duels.service';
import { DuelUtilsService } from '../../duel-utils.service';

/**
 * Registro centralizado de todos os efeitos de cartas
 * Usa Factory Pattern para instanciar efeitos quando necessário
 * 
 * IMPORTANTE: Este é o único lugar onde efeitos são registrados
 * Cada efeito é isolado e não interfere com outros
 */
@Injectable()
export class CardEffectRegistryService {
  private effects: Map<string, Type<ICardEffect>> = new Map();
  private effectInstances: Map<string, ICardEffect> = new Map();

  constructor(
    @Inject(forwardRef(() => DuelsService))
    private readonly duelsService: DuelsService,
    private readonly duelUtils: DuelUtilsService,
  ) {}

  /**
   * Registra um efeito de carta (classe completa)
   * @param effectClass Classe do efeito que implementa ICardEffect
   * @param instance Instância do efeito (criada pelo NestJS)
   */
  register(effectClass: Type<ICardEffect>, instance: ICardEffect): void {
    const names = instance.cardNames;
    
    for (const name of names) {
      const normalizedName = name.toLowerCase().trim();
      this.effects.set(normalizedName, effectClass);
      this.logInfo(`✅ Efeito registrado: ${name} -> ${effectClass.name}`);
    }

    if (instance.cardIds) {
      for (const id of instance.cardIds) {
        const normalizedId = id.toLowerCase().trim();
        this.effects.set(normalizedId, effectClass);
        this.logInfo(`✅ Efeito registrado (ID): ${id} -> ${effectClass.name}`);
      }
    }

    // Armazenar instância
    const cacheKey = effectClass.name;
    this.effectInstances.set(cacheKey, instance);
  }

  /**
   * Registra um efeito simples (apenas função)
   * Para efeitos básicos que não precisam de classe completa
   * 
   * @param cardNames Nomes da carta
   * @param effectFunction Função que processa o efeito
   * @param cardIds IDs da carta (opcional)
   * @param duelsService Serviço de duelos (será injetado na função)
   */
  registerSimple(
    cardNames: string[],
    effectFunction: SimpleCardEffectFunction,
    cardIds?: string[],
    duelsService?: DuelsService,
  ): void {
    // Criar wrapper que injeta duelsService no contexto
    const wrappedFunction: SimpleCardEffectFunction = async (context) => {
      // Injetar duelsService no contexto se não estiver presente
      if (!(context as any).duelsService && duelsService) {
        (context as any).duelsService = duelsService;
      }
      return await effectFunction(context);
    };

    const wrapper = new SimpleCardEffectWrapper(cardNames, wrappedFunction, cardIds);
    
    for (const name of cardNames) {
      const normalizedName = name.toLowerCase().trim();
      this.effects.set(normalizedName, SimpleCardEffectWrapper);
      this.logInfo(`✅ Efeito simples registrado: ${name} -> função`);
    }

    if (cardIds) {
      for (const id of cardIds) {
        const normalizedId = id.toLowerCase().trim();
        this.effects.set(normalizedId, SimpleCardEffectWrapper);
        this.logInfo(`✅ Efeito simples registrado (ID): ${id} -> função`);
      }
    }

    // Armazenar wrapper
    const cacheKey = `simple_${cardNames[0]}`;
    this.effectInstances.set(cacheKey, wrapper);
  }

  /**
   * Busca o efeito correspondente para uma carta
   * @param card Carta para buscar efeito
   * @returns Instância do efeito ou null se não encontrado
   */
  findEffect(card: any): ICardEffect | null {
    const cardId = card?.idCarta || card?.id || card?.cardId;
    const cardName = (card?.name || card?.cardName || '').trim().toLowerCase();

    // Tentar por nome primeiro
    const normalizedName = cardName.toLowerCase().trim();
    let effectClass = this.effects.get(normalizedName);
    
    if (!effectClass && cardId) {
      // Tentar por idCarta
      const normalizedId = String(cardId).toLowerCase().trim();
      effectClass = this.effects.get(normalizedId);
    }

    if (!effectClass) {
      // Tentar busca parcial por nome
      for (const [key, value] of this.effects.entries()) {
        if (cardName.includes(key) || key.includes(cardName)) {
          effectClass = value;
          break;
        }
      }
    }

    if (effectClass) {
      // Se for SimpleCardEffectWrapper, buscar pelo nome da carta
      if (effectClass === SimpleCardEffectWrapper) {
        // Buscar wrapper pelo nome da carta
        for (const [key, instance] of this.effectInstances.entries()) {
          if (key.startsWith('simple_') && instance.matches(card)) {
            return instance;
          }
        }
      } else {
        // Retornar instância armazenada (classe completa)
        const cacheKey = effectClass.name;
        return this.effectInstances.get(cacheKey) || null;
      }
    }

    return null;
  }

  /**
   * Obtém todas as cartas registradas
   */
  getRegisteredCards(): string[] {
    return Array.from(this.effects.keys());
  }

  private logInfo(message: string): void {
    logger.info(`📋 [CardEffectRegistry] ${message}`);
  }
}
