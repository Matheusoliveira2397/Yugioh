import type { DuelsService } from '../../../duels.service';


/** Registered choice; public API remains on DuelsService. */
export async function processConfiscationChoice(host: DuelsService, duelId: string | number, userId: number, instanceId: string): Promise<{ success: boolean; message?: string }> {
    return host['cardEffectHandlersService'].processConfiscationChoice(duelId, userId, instanceId);
  }
