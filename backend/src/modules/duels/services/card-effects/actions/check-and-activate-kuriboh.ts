import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import * as Kuriboh from '../effects/Monsters/kuriboh';

/** Registered effect action; public API remains on DuelsService. */
export async function checkAndActivateKuriboh(host: DuelsService, duelId: string | number, duel: Duel, isAttackerPlayer1: boolean, damageAmount: number): Promise<boolean> {
    return Kuriboh.checkAndActivateKuriboh(
      host as any,
      duelId,
      duel,
      isAttackerPlayer1,
      damageAmount,
    );
  }
