import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function skipMagiciansRodGy(host: DuelsService, duelId: string | number, userId: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = host['activeDuels'].get(duelIdStr) || (await host['findDuelByIdFromDatabase'](duelIdStr));
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const pending = (duel as any).pendingChoice;
    if (!pending || pending.type !== 'MAGICIAN_S_ROD_GY' || Number(pending.userId) !== Number(userId)) {
      return { success: false, message: 'Escolha inválida' };
    }

    // Declinar não consome OPT — outra ativação de S/T no mesmo turno pode oferecer de novo
    await host['clearPendingChoice'](duelIdStr, false);
    await host['updateDuelInDatabase'](duelIdStr, { pendingChoice: null } as any);
    host['activeDuels'].set(duelIdStr, duel);
    logger.info(`🪄 [Magician's Rod] reciclagem do GY pulada`);
    return { success: true };
  }
