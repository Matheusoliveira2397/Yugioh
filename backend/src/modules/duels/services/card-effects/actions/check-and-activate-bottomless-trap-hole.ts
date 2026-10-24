import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import * as TrapActivations from '../effects/traps/activations';

/** Registered effect action; public API remains on DuelsService. */
export async function checkAndActivateBottomlessTrapHole(host: DuelsService, duelId: string | number, duel: Duel, isPlayer1: boolean, monsterZoneIndex: number, monster: any): Promise<boolean> {
    return TrapActivations.checkAndActivateBottomlessTrapHole(host as any, duelId, duel, isPlayer1, monsterZoneIndex, monster);
  }
