import type { DuelsService } from '../../../duels.service';


/** Registered choice; public API remains on DuelsService. */
export async function processGracefulCharityChoice(host: DuelsService, duelId: string | number, userId: number, instanceIdsToDiscard: string[]): Promise<{ success: boolean; message?: string }> {
    return host['cardEffectHandlersService'].processGracefulCharityChoice(duelId, userId, instanceIdsToDiscard);
  }
