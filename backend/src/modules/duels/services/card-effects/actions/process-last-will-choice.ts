import type { DuelsService } from '../../../duels.service';


/** Registered choice; public API remains on DuelsService. */
export async function processLastWillChoice(host: DuelsService, duelId: string | number, userId: number, deckIndex: number, zoneIndex: number): Promise<{ success: boolean; message?: string }> {
    return host['cardEffectHandlersService'].processLastWillChoice(duelId, userId, deckIndex, zoneIndex);
  }
