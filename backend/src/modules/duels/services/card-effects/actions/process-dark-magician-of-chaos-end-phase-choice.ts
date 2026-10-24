import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';

/** Registered choice; public API remains on DuelsService. */
export async function processDarkMagicianOfChaosEndPhaseChoice(host: DuelsService, duelId: string | number, userId: number, graveyardIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = host['activeDuels'].get(duelIdStr) || (await host['findDuelByIdFromDatabase'](duelIdStr));
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const pending = (duel as any).pendingChoice;
    if (!pending || pending.type !== 'DARK_MAGICIAN_OF_CHAOS' || Number(pending.userId) !== Number(userId)) {
      return { success: false, message: 'Escolha inválida' };
    }

    const isPlayer1 = Number(duel.player1Id) === Number(userId);
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const zoneIndex = pending.data?.monsterZoneIndex;
    const monster = playerField?.monsters?.[zoneIndex];
    if (!monster || !Dmoc.isDarkMagicianOfChaos(monster)) {
      await host['clearPendingChoice'](duelIdStr, false);
      return { success: false, message: 'Dark Magician of Chaos não está no campo' };
    }

    const gy = playerField.graveyard || [];
    if (graveyardIndex < 0 || graveyardIndex >= gy.length || !Dmoc.isSpellCard(gy[graveyardIndex])) {
      return { success: false, message: 'Magia inválida no cemitério' };
    }

    const spell = gy.splice(graveyardIndex, 1)[0];
    if (!playerField.hand) playerField.hand = [];
    playerField.hand.push(spell);
    monster.dmocEndPhaseUsedThisTurn = true;
    monster.effectUsedThisTurn = true;

    await host['clearPendingChoice'](duelIdStr, false);
    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);
    host['activeDuels'].set(duelIdStr, duel);

    logger.info(
      `🌑 [DMoC] Magia "${spell.name || spell.cardName}" adicionada à mão`,
    );

    await host['finishEndPhaseAfterDmoc'](duelIdStr);
    return { success: true, message: `Adicionou ${spell.name || spell.cardName} à mão` };
  }
