import type { DuelsService } from '../duels.service';
import { EffectActionName, EffectActionArgs, EffectActionResult } from './card-effects/actions/catalog';
import { Injectable } from '@nestjs/common';
import { Duel } from '../entities/duel.entity';
import { EffectExecutor } from './card-effects/execution/effect-executor';

/** Public facade: activation and FLIP always use the registered event executor. */
@Injectable()
export class CardEffectsService {
  constructor(private readonly executor: EffectExecutor) {}

  executeAction<K extends EffectActionName>(name: K, host: DuelsService, args: EffectActionArgs<K>): EffectActionResult<K> {
    return this.executor.executeAction(name, host, args);
  }

  async processCardEffect(
    duelId: string,
    duel: Duel,
    isPlayer1: boolean,
    card: any,
    zoneIndex: number,
    selectedMonsterZoneIndex?: number,
  ): Promise<boolean> {
    const result = await this.executor.execute('activate', {
      duelId, duel, isPlayer1, card, zoneIndex, selectedMonsterZoneIndex,
      userId: isPlayer1 ? duel.player1Id : duel.player2Id,
    });
    return result.createdPendingChoice ?? false;
  }

  async processFlipEffect(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    card: any,
    zoneIndex: number,
  ): Promise<void> {
    await this.executor.execute('flip', {
      duelId, duel, isPlayer1, card, zoneIndex,
      userId: isPlayer1 ? duel.player1Id : duel.player2Id,
    });
  }
}
