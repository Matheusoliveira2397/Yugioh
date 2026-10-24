import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';
import * as MagiciansRod from '../effects/Monsters/magicians-rod';

/** Registered choice; public API remains on DuelsService. */
export async function processMagiciansRodSearchChoice(host: DuelsService, duelId: string | number, userId: number, deckIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = host['activeDuels'].get(duelIdStr) || (await host['findDuelByIdFromDatabase'](duelIdStr));
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const pending = (duel as any).pendingChoice;
    if (!pending || pending.type !== 'MAGICIAN_S_ROD_SEARCH' || Number(pending.userId) !== Number(userId)) {
      return { success: false, message: 'Escolha inválida' };
    }

    const isPlayer1 = Number(duel.player1Id) === Number(userId);
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const zoneIndex = pending.data?.monsterZoneIndex;
    const monster = playerField?.monsters?.[zoneIndex];
    if (!monster || !MagiciansRod.isMagiciansRod(monster)) {
      await host['clearPendingChoice'](duelIdStr, false);
      return { success: false, message: "Magician's Rod não está no campo" };
    }

    const deck = playerField.deck || [];
    if (deckIndex < 0 || deckIndex >= deck.length || !deck[deckIndex]) {
      return { success: false, message: 'Carta inválida no deck' };
    }
    const picked = deck[deckIndex];
    if (!MagiciansRod.isSpellOrTrapCard(picked) || !MagiciansRod.listsDarkMagicianInText(picked)) {
      return { success: false, message: 'Carta não lista Dark Magician' };
    }

    const [card] = deck.splice(deckIndex, 1);
    if (!playerField.hand) playerField.hand = [];
    playerField.hand.push(card);

    // Embaralhar deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    playerField.deck = deck;

    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    MagiciansRod.markRodSearchUsed(playerField, turnCounter);

    await host['clearPendingChoice'](duelIdStr, false);
    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);
    host['activeDuels'].set(duelIdStr, duel);

    const cardName = card.name || card.cardName || 'carta';
    logger.info(`🪄 [Magician's Rod] adicionou "${cardName}" à mão`);
    return { success: true, message: `Adicionou ${cardName} à mão` };
  }
