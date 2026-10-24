import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import * as TrapActivations from '../effects/traps/activations';

/** Registered effect action; public API remains on DuelsService. */
export async function checkAndActivateMagicCylinder(host: DuelsService, duelId: string | number, duel: Duel, isPlayer1: boolean, attackerZoneIndex: number, attacker: any): Promise<boolean> {
    return TrapActivations.checkAndActivateMagicCylinder(host as any, duelId, duel, isPlayer1, attackerZoneIndex, attacker);
  }
