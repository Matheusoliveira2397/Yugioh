import type { DuelsService } from '../../../duels.service';


/** Registered choice; public API remains on DuelsService. */
export async function processReinforcementOfTheArmyChoice(host: DuelsService, duelId: string | number, userId: number, deckIndex: number): Promise<{ success: boolean; message?: string }> {
    return host['cardEffectHandlersService'].processReinforcementOfTheArmyChoice(duelId, userId, deckIndex);
  }
