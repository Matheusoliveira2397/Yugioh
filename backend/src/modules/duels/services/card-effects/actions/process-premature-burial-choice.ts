import type { DuelsService } from '../../../duels.service';


/** Registered choice; public API remains on DuelsService. */
export async function processPrematureBurialChoice(host: DuelsService, duelId: string | number, userId: number, chosenMonster: { index: number }, spellTrapZoneIndex: number): Promise<{ success: boolean; message?: string; duel?: any }> {
    return host['cardEffectHandlersService'].processPrematureBurialChoice(duelId, userId, chosenMonster, spellTrapZoneIndex);
  }
