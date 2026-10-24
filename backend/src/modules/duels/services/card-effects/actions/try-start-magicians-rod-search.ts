import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';
import * as MagiciansRod from '../effects/Monsters/magicians-rod';

/** Registered effect action; public API remains on DuelsService. */
export async function tryStartMagiciansRodSearch(host: DuelsService, duelId: string | number, duel: Duel, isPlayer1: boolean, zoneIndex: number): Promise<boolean> {
    if ((duel as any).pendingChoice) return false;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const monster = playerField?.monsters?.[zoneIndex];
    if (!monster || !MagiciansRod.isMagiciansRod(monster)) return false;
    // Set (face-down) não é Invocação-Normal
    const pos = String(monster.position || '').toLowerCase();
    if (pos === 'set' || pos === 'face-down') return false;

    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    if (!MagiciansRod.canUseRodSearchThisTurn(playerField, turnCounter)) {
      logger.info(`🪄 [Magician's Rod] busca já usada neste turno`);
      return false;
    }

    const options = MagiciansRod.listDarkMagicianSpellsTrapsInDeck(playerField?.deck);
    if (options.length === 0) {
      logger.info(`🪄 [Magician's Rod] nenhuma Magia/Armadilha que liste Dark Magician no deck`);
      return false;
    }

    const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
    const choice = {
      type: 'MAGICIAN_S_ROD_SEARCH' as const,
      userId: Number(userId),
      turnWhenStarted: turnCounter,
      phaseWhenStarted: duel.currentPhase,
      data: {
        monsterZoneIndex: zoneIndex,
        deckOptions: options.map((o) => ({
          deckIndex: o.deckIndex,
          name: o.card?.name || o.card?.cardName,
          idCarta: o.card?.idCarta || o.card?.id || o.card?.cardId,
          cardImage: o.card?.cardImage || o.card?.imageUrl,
          type: o.card?.type || o.card?.cardType,
        })),
      },
    };
    (duel as any).pendingChoice = choice;
    await host['setPendingChoice'](duelId, choice);
    logger.info(
      `🪄 [Magician's Rod] busca disponível (${options.length} carta(s)) zona ${zoneIndex}`,
    );
    return true;
  }
