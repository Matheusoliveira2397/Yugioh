import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import * as TrapActivations from '../effects/traps/activations';

/** Registered effect action; public API remains on DuelsService. */
export async function checkAndActivateMirrorForce(host: DuelsService, duelId: string | number, duel: Duel, isPlayer1: boolean): Promise<boolean> {
    return TrapActivations.checkAndActivateMirrorForce(host as any, duelId, duel, isPlayer1);
  }
