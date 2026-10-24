import { Injectable, Type, Inject, forwardRef } from '@nestjs/common';
import { ICardEffect, SimpleCardEffectFunction, SimpleCardEffectWrapper, EffectEvent } from '../interfaces/card-effect.interface';
import { logger } from '../../../../../common/utils/logger.util';
import { DuelsService } from '../../../duels.service';
import { DuelUtilsService } from '../../duel-utils.service';
import { compactCardKey, normalizeCardKey } from '../utils/card-key.util';

/**
 * Registro centralizado de efeitos.
 *
 * Regras anti-regressão:
 * 1. Match EXATO por nome/id (nunca includes parcial)
 * 2. Cada chave aponta para UMA instância — colisão = erro (não sobrescreve)
 * 3. Instância resolvida pela chave, não por “primeiro matches()”
 */
@Injectable()
export class CardEffectRegistryService {
  /** chave normalizada → instância do efeito */
  private readonly effectsByKey = new Map<string, ICardEffect>();
  /** chave canônica (primeiro nome) → lista de aliases registrados */
  private readonly eventRegistries = new Map<EffectEvent, CardEffectRegistryService>();
  private readonly canonicalKeys = new Set<string>();

  constructor(
    @Inject(forwardRef(() => DuelsService))
    private readonly duelsService: DuelsService,
    private readonly duelUtils: DuelUtilsService,
  ) {}

  register(effectClass: Type<ICardEffect>, instance: ICardEffect): void {
    this.bindKeys(instance.cardNames, instance.cardIds, instance, effectClass.name);
  }

  registerSimple(
    cardNames: string[],
    effectFunction: SimpleCardEffectFunction,
    cardIds?: string[],
    duelsService?: DuelsService,
  ): void {
    const wrappedFunction: SimpleCardEffectFunction = async (context) => {
      if (!(context as any).duelsService && duelsService) {
        (context as any).duelsService = duelsService;
      }
      return await effectFunction(context);
    };

    const wrapper = new SimpleCardEffectWrapper(cardNames, wrappedFunction, cardIds);
    this.bindKeys(cardNames, cardIds, wrapper, `simple:${cardNames[0]}`);
  }

  private bindKeys(
    names: string[],
    ids: string[] | undefined,
    instance: ICardEffect,
    label: string,
  ): void {
    const keys = new Set<string>();
    for (const name of names) {
      keys.add(normalizeCardKey(name));
      keys.add(compactCardKey(name));
    }
    if (ids) {
      for (const id of ids) {
        keys.add(normalizeCardKey(id));
        keys.add(compactCardKey(id));
      }
    }

    for (const key of keys) {
      if (!key) continue;
      const existing = this.effectsByKey.get(key);
      if (existing && existing !== instance) {
        const msg =
          `COLISÃO DE EFEITO: chave "${key}" já registrada ` +
          `(${existing.cardNames?.[0] || '?'}) e tentou registrar ${label} ` +
          `(${instance.cardNames?.[0] || '?'}). Efeitos não podem se sobrescrever.`;
        logger.error(`❌ [CardEffectRegistry] ${msg}`);
        throw new Error(msg);
      }
    }
    // Commit only after every alias has passed collision validation.
    for (const key of keys) {
      if (!key) continue;
      this.effectsByKey.set(key, instance);
      this.logInfo(`✅ Efeito registrado: ${key} -> ${label}`);
    }

    if (names[0]) {
      this.canonicalKeys.add(normalizeCardKey(names[0]));
    }
  }

  /**
   * Busca efeito por match EXATO de nome ou id.
   */
  findEffect(card: any): ICardEffect | null {
    for (const candidate of [card?.name, card?.cardName, card?.idCarta, card?.id, card?.cardId]) {
      if (candidate == null) continue;
      const key = normalizeCardKey(candidate);
      const effect = this.effectsByKey.get(key) || this.effectsByKey.get(compactCardKey(key));
      if (effect) return effect;
    }

    return null;
  }

  /** Each timing has its own namespace: a FLIP effect cannot be activated as a spell. */
  registerEvent(event: EffectEvent, names: string[], fn: SimpleCardEffectFunction, ids?: string[]): void {
    if (event === 'activate') {
      this.registerSimple(names, fn, ids);
      return;
    }
    let registry = this.eventRegistries.get(event);
    if (!registry) {
      registry = new CardEffectRegistryService(this.duelsService, this.duelUtils);
      this.eventRegistries.set(event, registry);
    }
    registry.registerSimple(names, fn, ids);
  }

  findEventEffect(event: EffectEvent, card: any): ICardEffect | null {
    return event === 'activate' ? this.findEffect(card) : this.eventRegistries.get(event)?.findEffect(card) ?? null;
  }

  getRegisteredCards(): string[] {
    return Array.from(this.canonicalKeys).sort();
  }

  /** Todas as chaves (aliases + ids) — usado pelo selo de regressão */
  getAllKeys(): string[] {
    return Array.from(this.effectsByKey.keys()).sort();
  }

  getRegisteredCount(): number {
    return this.canonicalKeys.size;
  }

  hasKey(key: string): boolean {
    const n = normalizeCardKey(key);
    return this.effectsByKey.has(n) || this.effectsByKey.has(compactCardKey(n));
  }

  private logInfo(message: string): void {
    logger.info(`📋 [CardEffectRegistry] ${message}`);
  }
}
