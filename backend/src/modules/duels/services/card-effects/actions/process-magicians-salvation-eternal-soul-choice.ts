import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';
import * as MagiciansSalvation from '../effects/spells/magicians-salvation';

/** Registered choice; public API remains on DuelsService. */
export async function processMagiciansSalvationEternalSoulChoice(host: DuelsService, duelId: string | number, userId: number, deckIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = host['activeDuels'].get(duelIdStr) || (await host['findDuelByIdFromDatabase'](duelIdStr));
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const pending = (duel as any).pendingChoice;
    if (
      !pending ||
      pending.type !== 'MAGICIAN_S_SALVATION_ETERNAL_SOUL' ||
      Number(pending.userId) !== Number(userId)
    ) {
      return { success: false, message: 'Escolha inválida' };
    }

    const isPlayer1 = Number(duel.player1Id) === Number(userId);
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const deck = playerField.deck || [];
    if (deckIndex < 0 || deckIndex >= deck.length || !MagiciansSalvation.isEternalSoul(deck[deckIndex])) {
      return { success: false, message: 'Eternal Soul inválida no deck' };
    }

    let zoneIndex = pending.data?.spellTrapZoneIndex;
    if (!Array.isArray(playerField.spellTrap)) {
      playerField.spellTrap = [null, null, null, null, null];
    }
    if (zoneIndex == null || playerField.spellTrap[zoneIndex] != null) {
      zoneIndex = MagiciansSalvation.findEmptySpellTrapZone(playerField.spellTrap);
    }
    if (zoneIndex < 0) {
      await host['clearPendingChoice'](duelIdStr, false);
      return { success: false, message: 'Sem zona Magia/Armadilha vazia' };
    }

    const [card] = deck.splice(deckIndex, 1);
    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    playerField.spellTrap[zoneIndex] = {
      ...card,
      position: 'set',
      trapSetTurnCounter: turnCounter,
    };

    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    playerField.deck = deck;

    await host['clearPendingChoice'](duelIdStr, false);
    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);
    host['activeDuels'].set(duelIdStr, duel);

    logger.info(`✨ [Magician's Salvation] Eternal Soul baixada na zona ${zoneIndex}`);
    return { success: true, message: 'Eternal Soul baixada do deck' };
  }
