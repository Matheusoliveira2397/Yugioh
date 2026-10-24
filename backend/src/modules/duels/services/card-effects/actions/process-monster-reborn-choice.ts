import type { DuelsService } from '../../../duels.service';


/** Registered choice; public API remains on DuelsService. */
export async function processMonsterRebornChoice(host: DuelsService, duelId: string | number, userId: number, chosenMonster: { graveyard: 'player' | 'opponent'; index: number }): Promise<{ success: boolean; message?: string }> {
    return host['cardEffectHandlersService'].processMonsterRebornChoice(duelId, userId, chosenMonster);
  }
