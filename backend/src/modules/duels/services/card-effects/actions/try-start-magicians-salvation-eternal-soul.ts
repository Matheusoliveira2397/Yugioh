import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';
import * as MagiciansSalvation from '../effects/spells/magicians-salvation';

/** Registered effect action; public API remains on DuelsService. */
export async function tryStartMagiciansSalvationEternalSoul(host: DuelsService, duelId: string | number, duel: Duel, isPlayer1: boolean): Promise<boolean> {
    if ((duel as any).pendingChoice) return false;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!playerField) return false;

    if (!Array.isArray(playerField.spellTrap)) {
      playerField.spellTrap = [null, null, null, null, null];
    }
    while (playerField.spellTrap.length < 5) playerField.spellTrap.push(null);

    const emptyZone = MagiciansSalvation.findEmptySpellTrapZone(playerField.spellTrap);
    if (emptyZone < 0) {
      logger.info(`✨ [Magician's Salvation] sem zona S/T vazia para Eternal Soul`);
      return false;
    }

    const options = MagiciansSalvation.findEternalSoulInDeck(playerField.deck);
    if (options.length === 0) {
      logger.info(`✨ [Magician's Salvation] nenhuma Eternal Soul no deck`);
      return false;
    }

    const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    const choice = {
      type: 'MAGICIAN_S_SALVATION_ETERNAL_SOUL' as const,
      userId: Number(userId),
      turnWhenStarted: turnCounter,
      phaseWhenStarted: duel.currentPhase,
      data: {
        spellTrapZoneIndex: emptyZone,
        deckOptions: options.map((o) => ({
          deckIndex: o.deckIndex,
          name: o.card?.name || o.card?.cardName,
          idCarta: o.card?.idCarta || o.card?.id,
          cardImage: o.card?.cardImage || o.card?.imageUrl,
        })),
      },
    };
    (duel as any).pendingChoice = choice;
    await host['setPendingChoice'](duelId, choice);
    logger.info(`✨ [Magician's Salvation] Eternal Soul disponível (${options.length})`);
    return true;
  }
