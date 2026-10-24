import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';
import * as KingsKnight from '../effects/Monsters/kings-knight';

/** Registered effect action; public API remains on DuelsService. */
export async function tryStartKingsKnightSearch(host: DuelsService, duelId: string | number, duel: Duel, isPlayer1: boolean, zoneIndex: number): Promise<boolean> {
    if ((duel as any).pendingChoice) return false;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const monster = playerField?.monsters?.[zoneIndex];
    if (!monster || !KingsKnight.isKingsKnight(monster)) return false;

    // Check if face-up
    const pos = String(monster.position || '').toLowerCase();
    if (pos === 'set' || pos === 'face-down') return false;

    // Check if Queen's Knight is on field
    if (!KingsKnight.hasQueensKnightOnField(playerField)) {
      logger.info(`👑 [King's Knight] Queen's Knight não está no campo`);
      return false;
    }

    // Check if Jack's Knight is in deck
    const options = KingsKnight.listJacksKnightInDeck(playerField?.deck);
    if (options.length === 0) {
      logger.info(`👑 [King's Knight] Nenhum Jack's Knight no deck`);
      return false;
    }

    // Check if there's an empty monster zone
    const hasEmptyZone = playerField?.monsters?.some((m: any) => !m);
    if (!hasEmptyZone) {
      logger.info(`👑 [King's Knight] Nenhuma zona de monstro vazia`);
      return false;
    }

    const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    const choice = {
      type: 'KINGS_KNIGHT_SEARCH' as const,
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
      `👑 [King's Knight] busca disponível (${options.length} Jack's Knight(s)) zona ${zoneIndex}`,
    );
    return true;
  }
