import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import * as TrapActivations from '../effects/traps/activations';

/** Registered effect action; public API remains on DuelsService. */
export async function checkAndActivateDimensionalPrison(host: DuelsService, duelId: string | number, duel: Duel, isPlayer1: boolean, attackerZoneIndex: number): Promise<boolean> {
    return TrapActivations.checkAndActivateDimensionalPrison(host as any, duelId, duel, isPlayer1, attackerZoneIndex);
  }
