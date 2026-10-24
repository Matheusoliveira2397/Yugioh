import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function skipDarkMagicianOfChaosEndPhase(host: DuelsService, duelId: string | number, userId: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = host['activeDuels'].get(duelIdStr) || (await host['findDuelByIdFromDatabase'](duelIdStr));
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const pending = (duel as any).pendingChoice;
    if (!pending || pending.type !== 'DARK_MAGICIAN_OF_CHAOS' || Number(pending.userId) !== Number(userId)) {
      return { success: false, message: 'Escolha inválida' };
    }

    await host['clearPendingChoice'](duelIdStr, false);
    await host['updateDuelInDatabase'](duelIdStr, { pendingChoice: null } as any);
    logger.info(`🌑 [DMoC] End Phase efeito pulado pelo jogador`);
    await host['finishEndPhaseAfterDmoc'](duelIdStr);
    return { success: true };
  }
