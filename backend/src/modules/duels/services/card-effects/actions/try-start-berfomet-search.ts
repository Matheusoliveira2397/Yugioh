import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';
import * as Berfomet from '../effects/Monsters/berfomet';

/** Registered effect action; public API remains on DuelsService. */
export async function tryStartBerfometSearch(host: DuelsService, duelId: string | number, duel: Duel, isPlayer1: boolean, zoneIndex: number): Promise<boolean> {
    if ((duel as any).pendingChoice) return false;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const monster = playerField?.monsters?.[zoneIndex];
    if (!monster || !Berfomet.isBerfomet(monster)) return false;

    // Set (face-down) não é Invocação-Normal — mas isso só importa para Normal Summon
    // Para flip summon, o monstro já estará em defense após flipar
    const pos = String(monster.position || '').toLowerCase();
    if (pos === 'set' || pos === 'face-down') return false;

    const options = Berfomet.listGazelleInDeck(playerField?.deck);
    if (options.length === 0) {
      logger.info(`🐺 [Berfomet] nenhuma Gazelle no deck`);
      return false;
    }

    const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    const choice = {
      type: 'BERFOMET_SEARCH' as const,
      userId: Number(userId),
      turnWhenStarted: turnCounter,
      phaseWhenStarted: duel.currentPhase,
      data: {
        monsterZoneIndex: zoneIndex,
        deckOptions: options.map((o) => ({
          deckIndex: o.deckIndex,
          name: o.card?.name || o.card?.cardName,
          idCarta: o.card?.idCarta || o.card?.id,
          cardImage: o.card?.cardImage || o.card?.imageUrl,
        })),
      },
    };
    (duel as any).pendingChoice = choice;
    logger.info(
      `🐺 [Berfomet] busca disponível (${options.length} Gazelle(s)) zona ${zoneIndex}`,
    );
    return true;
  }
