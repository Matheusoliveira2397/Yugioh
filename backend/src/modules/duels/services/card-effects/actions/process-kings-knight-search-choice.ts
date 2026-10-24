import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';
import * as KingsKnight from '../effects/Monsters/kings-knight';

/** Registered choice; public API remains on DuelsService. */
export async function processKingsKnightSearchChoice(host: DuelsService, duelId: string | number, userId: number, deckIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = host['activeDuels'].get(duelIdStr) || (await host['findDuelByIdFromDatabase'](duelIdStr));
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const pending = (duel as any).pendingChoice;
    if (!pending || pending.type !== 'KINGS_KNIGHT_SEARCH' || Number(pending.userId) !== Number(userId)) {
      return { success: false, message: 'Escolha inválida' };
    }

    const isPlayer1 = Number(duel.player1Id) === Number(userId);
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const zoneIndex = pending.data?.monsterZoneIndex;
    const monster = playerField?.monsters?.[zoneIndex];
    if (!monster || !KingsKnight.isKingsKnight(monster)) {
      await host['clearPendingChoice'](duelIdStr, false);
      return { success: false, message: "King's Knight não está no campo" };
    }

    // Verify Queen's Knight is still on field
    if (!KingsKnight.hasQueensKnightOnField(playerField)) {
      await host['clearPendingChoice'](duelIdStr, false);
      return { success: false, message: "Queen's Knight não está mais no campo" };
    }

    const deck = playerField.deck || [];
    if (deckIndex < 0 || deckIndex >= deck.length || !deck[deckIndex]) {
      return { success: false, message: 'Carta inválida no deck' };
    }
    const picked = deck[deckIndex];
    if (!KingsKnight.isJacksKnight(picked)) {
      return { success: false, message: "Carta não é Jack's Knight" };
    }

    // Find empty monster zone
    let emptyZone = -1;
    for (let i = 0; i < (playerField?.monsters?.length || 0); i++) {
      if (!playerField.monsters[i]) {
        emptyZone = i;
        break;
      }
    }

    if (emptyZone === -1) {
      await host['clearPendingChoice'](duelIdStr, false);
      return { success: false, message: 'Nenhuma zona de monstro vazia' };
    }

    // Special Summon Jack's Knight
    const [card] = deck.splice(deckIndex, 1);
    const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;
    playerField.monsters[emptyZone] = {
      ...card,
      position: 'attack',
      summonedTurnNumber: currentTurnCounter,
      summonedByPlayer: duel.currentTurn,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
      specialSummoned: true,
    };

    logger.info(`👑 [King's Knight] Jack's Knight invocado especialmente na zona ${emptyZone}`);

    // Check for trap activations on special summon
    const summoned = playerField.monsters[emptyZone];
    if (summoned && typeof host['checkTrapsOnMonsterSummon'] === 'function') {
      const destroyed = await host['checkTrapsOnMonsterSummon'](
        duelId,
        duel,
        isPlayer1,
        emptyZone,
        summoned,
        'attack',
      );
      if (destroyed) {
        logger.info(`👑 [King's Knight] Jack's Knight foi destruído por armadilha`);
      }
    }

    // Embaralhar deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    playerField.deck = deck;

    await host['clearPendingChoice'](duelIdStr, false);
    await host['updateDuelInDatabase'](duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);
    await host['recalculateUnitedWeStandForBothPlayers'](duelId, duel);
    host['activeDuels'].set(duelIdStr, duel);

    const cardName = card.name || card.cardName || "Jack's Knight";
    logger.info(`👑 [King's Knight] invocou especialmente "${cardName}"`);
    return { success: true, message: `Invocou ${cardName} especialmente` };
  }
