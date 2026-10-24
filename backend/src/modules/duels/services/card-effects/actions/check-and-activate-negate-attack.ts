import type { DuelsService } from '../../../duels.service';
import { Duel, TurnPhase } from '../../../entities/duel.entity';
import * as TrapActivations from '../effects/traps/activations';

/** Registered effect action; public API remains on DuelsService. */
export async function checkAndActivateNegateAttack(host: DuelsService, duelId: string | number, duel: Duel, isPlayer1: boolean, attackerZoneIndex: number, attacker: any): Promise<boolean> {
    const activated = await TrapActivations.checkAndActivateNegateAttack(
      host as any,
      duelId,
      duel,
      isPlayer1,
      attackerZoneIndex,
      attacker,
    );
    if (activated) {
      await host['goToPhase'](duelId, TurnPhase.MAIN2);
    }
    return activated;
  }
