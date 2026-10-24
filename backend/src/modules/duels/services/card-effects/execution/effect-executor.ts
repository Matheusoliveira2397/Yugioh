import type { DuelsService } from '../../../duels.service';
import { EFFECT_ACTIONS, PLAYER_EFFECT_ACTIONS, EffectActionName, EffectActionArgs, EffectActionResult } from '../actions/catalog';
import { Injectable } from '@nestjs/common';
import { CardEffectRegistryService } from '../registry/card-effect-registry.service';
import { CardEffectContext, CardEffectResult, EffectEvent } from '../interfaces/card-effect.interface';

export interface EffectChainLink {
  event: EffectEvent;
  context: CardEffectContext;
  negated?: boolean;
}

export interface EffectChainResolution {
  results: CardEffectResult[];
  /** Activation order, retained when a choice suspends resolution. */
  remaining: EffectChainLink[];
  suspended: boolean;
}

/** The same resolution rules apply to activation, FLIP and explicitly supplied chains. */
@Injectable()
export class EffectExecutor {
  constructor(private readonly registry: CardEffectRegistryService) {}

  executeAction<K extends EffectActionName>(name: K, host: DuelsService, args: EffectActionArgs<K>): EffectActionResult<K> {
    const action = EFFECT_ACTIONS[name];
    if (!action) throw new Error(`Ação de efeito não registrada: ${name}`);
    return (async () => {
      if (PLAYER_EFFECT_ACTIONS.has(name)) {
        const [duelId, actor] = args;
        const duel = await host.findDuelByIdFromDatabase(String(duelId));
        if (!duel) return { success: false, message: 'Duelo não encontrado' };
        const actorId = Number(actor);
        if (!Number.isSafeInteger(actorId) ||
            (actorId !== Number(duel.player1Id) && actorId !== Number(duel.player2Id))) {
          return { success: false, message: 'Jogador não participa deste duelo' };
        }
      }
      return await Reflect.apply(action, undefined, [host, ...args]);
    })() as EffectActionResult<K>;
  }

  async execute(event: EffectEvent, context: CardEffectContext): Promise<CardEffectResult> {
    const effect = this.registry.findEventEffect(event, context.card);
    if (!effect) return { success: false, message: 'Efeito não registrado para este evento' };
    const eventContext = { ...context, event };
    if (effect.canActivate && !(await effect.canActivate(eventContext))) {
      return { success: false, message: 'Condições de ativação não atendidas' };
    }
    // Exceptions propagate: never run another implementation or report success after failure.
    return effect.process(eventContext);
  }

  /** Last link resolves first; a choice suspends lower links without replaying the resolved one. */
  async resolveChain(links: readonly EffectChainLink[]): Promise<EffectChainResolution> {
    const pending = links.map(link => ({ ...link, context: { ...link.context } }));
    const results: CardEffectResult[] = [];
    while (pending.length) {
      const link = pending.pop()!;
      const result = link.negated
        ? { success: false, message: 'Efeito negado' }
        : await this.execute(link.event, link.context);
      results.push(result);
      if (result.createdPendingChoice) {
        return { results, remaining: pending, suspended: true };
      }
    }
    return { results, remaining: [], suspended: false };
  }
}
