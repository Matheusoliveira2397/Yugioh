import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function skipMagiciansRodSearch(host: DuelsService, duelId: string | number, userId: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = host['activeDuels'].get(duelIdStr) || (await host['findDuelByIdFromDatabase'](duelIdStr));
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const pending = (duel as any).pendingChoice;
    if (!pending || pending.type !== 'MAGICIAN_S_ROD_SEARCH' || Number(pending.userId) !== Number(userId)) {
      return { success: false, message: 'Escolha inválida' };
    }

    // Declinar o "você pode" não consome o once-per-turn
    await host['clearPendingChoice'](duelIdStr, false);
    await host['updateDuelInDatabase'](duelIdStr, { pendingChoice: null } as any);
    host['activeDuels'].set(duelIdStr, duel);
    logger.info(`🪄 [Magician's Rod] busca pulada`);
    return { success: true };
  }
