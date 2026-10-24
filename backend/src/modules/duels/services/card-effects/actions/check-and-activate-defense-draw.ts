import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import * as TrapActivations from '../effects/traps/activations';

/** Registered effect action; public API remains on DuelsService. */
export async function checkAndActivateDefenseDraw(host: DuelsService, duelId: string | number, duel: Duel, isAttackerPlayer1: boolean, damageAmount: number): Promise<boolean> {
    return TrapActivations.checkAndActivateDefenseDraw(host as any, duelId, duel, isAttackerPlayer1, damageAmount);
  }
